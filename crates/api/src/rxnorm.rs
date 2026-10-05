//! NLM RxNav (RxNorm API) client — brand names, salts and typo-tolerant
//! lookups mapped back to dataset drug ids.
//!
//! Hybrid search: an offline alias table (`data/aliases.json`, built once by
//! the `build-aliases` binary) answers almost every query locally; this
//! client is the live fallback for anything the table misses.
//!
//! RxNav terms of service: free, no licence for these endpoints, at most 20
//! requests/second per IP, cache results 12–24 h. We stay far below that
//! (bounded concurrency + a 24 h cache) and only ever send drug-name strings.

use std::collections::{BTreeSet, HashMap};
use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tokio::sync::{Mutex, Semaphore};

/// Concurrent RxNav requests from this process (ToS limit is 20 req/s).
const MAX_IN_FLIGHT: usize = 4;
const CACHE_TTL: Duration = Duration::from_secs(24 * 60 * 60);

#[derive(Debug, thiserror::Error)]
pub enum RxNormError {
    #[error("rxnav request failed: {0}")]
    Http(#[from] reqwest::Error),
}

/// Names RxNorm knows a dataset drug by.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct DrugAliases {
    /// RxNorm ingredient name(s), e.g. "aspirin" for Acetylsalicylic acid.
    #[serde(default)]
    pub ingredients: Vec<String>,
    /// Brand names (TTY=BN), e.g. "Coumadin".
    #[serde(default)]
    pub brands: Vec<String>,
    /// Precise ingredients / salts (TTY=PIN), e.g. "warfarin sodium".
    #[serde(default)]
    pub salts: Vec<String>,
}

impl DrugAliases {
    pub fn all(&self) -> impl Iterator<Item = &String> {
        // most specific first: ingredient, salts, then brands (some brands
        // are multi-ingredient combination products)
        self.ingredients
            .iter()
            .chain(&self.salts)
            .chain(&self.brands)
    }
}

/// `data/aliases.json`: dataset drug id → its RxNorm names.
pub type AliasTable = HashMap<String, DrugAliases>;

/// Load the offline table; a missing file just means "no aliases yet".
pub fn load_alias_table(path: &Path) -> AliasTable {
    match std::fs::read_to_string(path) {
        Ok(text) => serde_json::from_str(&text).unwrap_or_else(|e| {
            tracing::warn!(path = %path.display(), error = %e, "alias table unreadable; ignoring");
            AliasTable::new()
        }),
        Err(_) => {
            tracing::info!(path = %path.display(), "no alias table; run the build-aliases binary for brand-name search");
            AliasTable::new()
        }
    }
}

/// Same normalisation the dataset builder uses for drug ids.
pub fn normalize(name: &str) -> String {
    let cleaned: String = name
        .trim()
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    cleaned.trim_matches('-').to_string()
}

/// Any known name (dataset name, RxNorm ingredient, brand, salt) → drug ids.
#[derive(Debug, Default)]
pub struct AliasIndex {
    by_name: HashMap<String, Vec<String>>,
}

impl AliasIndex {
    pub fn new<'a>(
        table: &AliasTable,
        drugs: impl IntoIterator<Item = (&'a str, &'a str)>,
    ) -> Self {
        let mut by_name: HashMap<String, Vec<String>> = HashMap::new();
        let mut add = |name: &str, id: &str| {
            let ids = by_name.entry(normalize(name)).or_default();
            if !ids.iter().any(|x| x == id) {
                ids.push(id.to_string());
            }
        };
        for (id, name) in drugs {
            add(name, id);
            add(id, id);
        }
        for (id, aliases) in table {
            for alias in aliases.all() {
                add(alias, id);
            }
        }
        Self { by_name }
    }

    pub fn lookup(&self, name: &str) -> &[String] {
        self.by_name
            .get(&normalize(name))
            .map_or(&[], Vec::as_slice)
    }
}

#[derive(Debug, Deserialize)]
struct IdGroupResponse {
    #[serde(rename = "idGroup")]
    id_group: IdGroup,
}

#[derive(Debug, Deserialize)]
struct IdGroup {
    #[serde(rename = "rxnormId", default)]
    rxnorm_id: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct RelatedResponse {
    #[serde(rename = "relatedGroup")]
    related_group: RelatedGroup,
}

#[derive(Debug, Deserialize)]
struct RelatedGroup {
    #[serde(rename = "conceptGroup", default)]
    concept_group: Vec<ConceptGroup>,
}

#[derive(Debug, Deserialize)]
struct ConceptGroup {
    tty: String,
    #[serde(rename = "conceptProperties", default)]
    concept_properties: Vec<ConceptProperty>,
}

#[derive(Debug, Deserialize)]
struct ConceptProperty {
    name: String,
}

#[derive(Debug, Deserialize)]
struct ApproximateResponse {
    #[serde(rename = "approximateGroup")]
    approximate_group: ApproximateGroup,
}

#[derive(Debug, Deserialize)]
struct ApproximateGroup {
    #[serde(default)]
    candidate: Vec<Candidate>,
}

#[derive(Debug, Deserialize)]
struct Candidate {
    rxcui: String,
}

/// Normalised query → (fetched at, ingredient names).
type FallbackCache = HashMap<String, (Instant, Vec<String>)>;

/// Thin RxNav client with a bounded-concurrency guard and a 24 h cache for
/// fallback lookups.
#[derive(Clone)]
pub struct RxNormClient {
    http: reqwest::Client,
    base_url: Arc<str>,
    permits: Arc<Semaphore>,
    cache: Arc<Mutex<FallbackCache>>,
}

impl RxNormClient {
    pub fn new(http: reqwest::Client, base_url: &str) -> Self {
        Self {
            http,
            base_url: base_url.trim_end_matches('/').into(),
            permits: Arc::new(Semaphore::new(MAX_IN_FLIGHT)),
            cache: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    async fn get<T: for<'de> Deserialize<'de>>(
        &self,
        path: &str,
        query: &[(&str, &str)],
    ) -> Result<T, RxNormError> {
        let _permit = self
            .permits
            .acquire()
            .await
            .expect("semaphore never closed");
        Ok(self
            .http
            .get(format!("{}{path}", self.base_url))
            .query(query)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?)
    }

    /// RxCUI for an exact or normalized name (handles synonyms such as
    /// "Acetylsalicylic acid" → aspirin).
    pub async fn rxcui_for_name(&self, name: &str) -> Result<Option<String>, RxNormError> {
        let body: IdGroupResponse = self
            .get("/REST/rxcui.json", &[("name", name), ("search", "2")])
            .await?;
        Ok(body.id_group.rxnorm_id.into_iter().next())
    }

    /// Ingredient, brand and salt names related to an RxCUI.
    pub async fn related_names(&self, rxcui: &str) -> Result<DrugAliases, RxNormError> {
        let body: RelatedResponse = self
            .get(
                &format!("/REST/rxcui/{rxcui}/related.json"),
                // a space encodes to the literal `+` separator RxNav expects
                &[("tty", "IN BN PIN")],
            )
            .await?;
        let mut out = DrugAliases::default();
        for group in body.related_group.concept_group {
            let names = group.concept_properties.into_iter().map(|c| c.name);
            match group.tty.as_str() {
                "IN" => out.ingredients.extend(names),
                "BN" => out.brands.extend(names),
                "PIN" => out.salts.extend(names),
                _ => {}
            }
        }
        Ok(out)
    }

    /// Typo-tolerant fallback: ingredient names that best match `term`.
    /// Cached for 24 h per normalised term.
    pub async fn resolve_ingredients(&self, term: &str) -> Result<Vec<String>, RxNormError> {
        let key = term.trim().to_lowercase();
        if let Some((at, hit)) = self.cache.lock().await.get(&key)
            && at.elapsed() < CACHE_TTL
        {
            return Ok(hit.clone());
        }
        let body: ApproximateResponse = self
            .get(
                "/REST/approximateTerm.json",
                &[("term", &key), ("maxEntries", "5"), ("option", "1")],
            )
            .await?;
        let rxcuis: BTreeSet<String> = body
            .approximate_group
            .candidate
            .into_iter()
            .map(|c| c.rxcui)
            .take(5)
            .collect();
        let mut ingredients = Vec::new();
        for rxcui in rxcuis {
            for name in self.related_names(&rxcui).await?.ingredients {
                if !ingredients.contains(&name) {
                    ingredients.push(name);
                }
            }
        }
        self.cache
            .lock()
            .await
            .insert(key, (Instant::now(), ingredients.clone()));
        Ok(ingredients)
    }
}
