//! One-time builder for the offline alias table (`data/aliases.json`):
//! for every dataset drug, ask RxNav for its RxNorm ingredient name, brand
//! names and salts. Paced well under the RxNav limit (20 req/s per IP).
//!
//! Usage: cargo run -p drug-interaction-api --bin build_aliases -- \
//!          [data/ddi_dataset.json] [data/aliases.json]

use std::collections::BTreeMap;
use std::time::Duration;

use drug_interaction_api::rxnorm::{DrugAliases, RxNormClient};
use interaction_graph::graph::Dataset;

const CHUNK: usize = 4;
const PAUSE: Duration = Duration::from_millis(250);

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args().skip(1);
    let dataset_path = args
        .next()
        .unwrap_or_else(|| "data/ddi_dataset.json".into());
    let out_path = args.next().unwrap_or_else(|| "data/aliases.json".into());
    let base =
        std::env::var("APP_RXNAV_URL").unwrap_or_else(|_| "https://rxnav.nlm.nih.gov".into());

    let dataset: Dataset = serde_json::from_str(&std::fs::read_to_string(&dataset_path)?)?;
    let http = reqwest::Client::builder()
        .user_agent("drug-interaction-visualizer/alias-builder")
        .timeout(Duration::from_secs(20))
        .build()?;
    let client = RxNormClient::new(http, &base);

    let total = dataset.drugs.len();
    let mut table: BTreeMap<String, DrugAliases> = BTreeMap::new();
    let (mut unmatched, mut failed) = (0usize, 0usize);

    for (chunk_no, chunk) in dataset.drugs.chunks(CHUNK).enumerate() {
        let mut tasks = tokio::task::JoinSet::new();
        for drug in chunk {
            let (client, id, name) = (client.clone(), drug.id.clone(), drug.name.clone());
            tasks.spawn(async move {
                let aliases = match client.rxcui_for_name(&name).await? {
                    Some(rxcui) => Some(client.related_names(&rxcui).await?),
                    None => None,
                };
                Ok::<_, drug_interaction_api::rxnorm::RxNormError>((id, aliases))
            });
        }
        while let Some(joined) = tasks.join_next().await {
            match joined? {
                Ok((id, Some(aliases))) if aliases.all().next().is_some() => {
                    table.insert(id, aliases);
                }
                Ok(_) => unmatched += 1,
                Err(e) => {
                    failed += 1;
                    eprintln!("rxnav error: {e}");
                }
            }
        }
        if chunk_no % 50 == 0 {
            eprintln!("{}/{total} drugs processed", (chunk_no + 1) * CHUNK);
        }
        tokio::time::sleep(PAUSE).await;
    }

    let brands: usize = table.values().map(|a| a.brands.len()).sum();
    std::fs::write(&out_path, serde_json::to_string_pretty(&table)?)?;
    println!("drugs with RxNorm names: {} / {total}", table.len());
    println!("brand names:             {brands}");
    println!("no RxNorm match:         {unmatched}");
    println!("request failures:        {failed}");
    println!("wrote:                   {out_path}");
    Ok(())
}
