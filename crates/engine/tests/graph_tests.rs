use interaction_graph::dataset::build;
use interaction_graph::graph::{Dataset, Drug, Interaction, InteractionGraph};

fn fixture() -> Dataset {
    let d = |id: &str, name: &str, category: &str| Drug {
        id: id.into(),
        name: name.into(),
        category: category.into(),
    };
    let i = |from: &str, to: &str, kind: &str, direction: &str, severity: &str| Interaction {
        from: from.into(),
        to: to.into(),
        kind: kind.into(),
        direction: direction.into(),
        severity: severity.into(),
        mechanism: "test mechanism".into(),
        evidence: "test evidence".into(),
        severity_basis: String::new(),
    };
    Dataset {
        drugs: vec![
            d("a", "Drug A", "cat1"),
            d("b", "Drug B", "cat2"),
            d("c", "Drug C", "cat1"),
            d("d", "Drug D", "cat3"),
        ],
        interactions: vec![
            i("a", "b", "metabolism", "increase", "severe"),
            i("b", "c", "exposure", "decrease", "moderate"),
            i("c", "d", "qtc-prolonging", "increase", "severe"),
        ],
    }
}

#[test]
fn builds_and_counts() {
    let engine = InteractionGraph::from_dataset(&fixture()).expect("valid dataset");
    assert_eq!(engine.node_count(), 4);
    assert_eq!(engine.edge_count(), 3);
}

#[test]
fn drugs_sorted_by_degree() {
    let engine = InteractionGraph::from_dataset(&fixture()).expect("valid dataset");
    let drugs = engine.drugs();
    assert_eq!(drugs.len(), 4);
    assert_eq!(drugs[0].0.id, "b");
    assert!(drugs[0].1 >= drugs[1].1);
}

#[test]
fn degree_and_neighbors() {
    let engine = InteractionGraph::from_dataset(&fixture()).expect("valid dataset");
    assert_eq!(engine.degree("b").expect("b exists"), 2);
    let neighbors = engine.neighbors("a").expect("a exists");
    assert_eq!(neighbors.len(), 1);
    assert_eq!(neighbors[0].drug.id, "b");
    assert_eq!(neighbors[0].interaction.severity, "severe");
    assert_eq!(neighbors[0].interaction.direction, "increase");
}

#[test]
fn chain_finds_shortest_path() {
    let engine = InteractionGraph::from_dataset(&fixture()).expect("valid dataset");
    let chain = engine
        .interaction_chain("a", "d", 3)
        .expect("ids exist")
        .expect("connected within 3 hops");
    assert_eq!(chain.len(), 3);
    assert_eq!(chain[0].from, "a");
    assert_eq!(chain[2].to, "d");
}

#[test]
fn chain_respects_hop_limit() {
    let engine = InteractionGraph::from_dataset(&fixture()).expect("valid dataset");
    assert!(
        engine
            .interaction_chain("a", "d", 2)
            .expect("ids exist")
            .is_none()
    );
}

#[test]
fn unknown_drug_is_an_error() {
    let engine = InteractionGraph::from_dataset(&fixture()).expect("valid dataset");
    assert!(engine.degree("nope").is_err());
    assert!(engine.neighbors("nope").is_err());
    assert!(engine.interaction_chain("nope", "a", 3).is_err());
}

#[test]
fn hubs_sorted_by_degree() {
    let engine = InteractionGraph::from_dataset(&fixture()).expect("valid dataset");
    let hubs = engine.hubs(2);
    assert_eq!(hubs[0].0.id, "b");
    assert_eq!(hubs.len(), 2);
}

#[test]
fn export_json_has_nodes_edges_stats() {
    let engine = InteractionGraph::from_dataset(&fixture()).expect("valid dataset");
    let value = engine.export_graph_json(Some(2));
    assert_eq!(
        value["nodes"].as_array().expect("nodes array").len(),
        2,
        "top-2 subgraph keeps only the two highest-degree nodes"
    );
    assert_eq!(value["stats"]["drugs"], 4, "stats describe the full graph");
    assert_eq!(value["stats"]["interactions"], 3);
    assert!(value["stats"]["returned_nodes"].as_u64().unwrap() <= 2);
}

#[test]
fn export_full_graph_when_no_top() {
    let engine = InteractionGraph::from_dataset(&fixture()).expect("valid dataset");
    let value = engine.export_graph_json(None);
    assert_eq!(value["nodes"].as_array().expect("nodes array").len(), 4);
    assert_eq!(value["edges"].as_array().expect("edges array").len(), 3);
}

#[test]
fn ego_graph_within_hops() {
    let engine = InteractionGraph::from_dataset(&fixture()).expect("valid dataset");
    let ego = engine.export_ego_graph_json("a", 1).expect("a exists");
    let nodes = ego["nodes"].as_array().expect("nodes array");
    assert_eq!(nodes.len(), 2, "a + its direct neighbor only");
    assert_eq!(ego["center"], "a");
}

#[test]
fn build_from_csv_normalizes_and_dedupes() {
    let dir = std::env::temp_dir().join("interaction-graph-tests");
    std::fs::create_dir_all(&dir).expect("temp dir");
    let raw = dir.join("raw.csv");
    let out = dir.join("dataset.json");

    std::fs::write(
        &raw,
        "Drug 1,Drug 2,Interaction Description\n\
         Drug A,Drug B,\"Drug A may increase the photosensitizing activities of Drug B.\"\n\
         Drug B,Drug A,\"Drug B may increase the photosensitizing activities of Drug A.\"\n\
         Drug C,Drug A,\"The metabolism of Drug C can be increased when combined with Drug A.\"\n\
         Drug A,Drug A,\"Drug A may increase the photosensitizing activities of Drug A.\"\n",
    )
    .expect("write raw csv");

    build(&raw, &out).expect("build succeeds");

    let dataset: Dataset =
        serde_json::from_str(&std::fs::read_to_string(&out).expect("output exists"))
            .expect("valid dataset json");
    // 4 source rows -> 2 kept (duplicate reversed pair dropped, self-pair dropped)
    assert_eq!(dataset.interactions.len(), 2);
    assert_eq!(dataset.drugs.len(), 3);

    let photosensitizing = dataset
        .interactions
        .iter()
        .find(|i| i.kind == "activity:photosensitizing")
        .expect("activity template classified");
    assert_eq!(photosensitizing.severity, "mild");
    assert_eq!(photosensitizing.direction, "increase");

    let metabolism = dataset
        .interactions
        .iter()
        .find(|i| i.kind == "metabolism")
        .expect("metabolism template classified");
    assert_eq!(metabolism.severity, "moderate");
    assert_eq!(metabolism.direction, "increase");
    assert_eq!(metabolism.from, "drug-c");
    assert_eq!(metabolism.to, "drug-a");
}

/// Run the REAL classifier + severity layers over template sentences.
fn build_rows(name: &str, rows: &str) -> Dataset {
    let dir = std::env::temp_dir().join(format!("interaction-graph-tests-{name}"));
    std::fs::create_dir_all(&dir).expect("temp dir");
    let (raw, out) = (dir.join("raw.csv"), dir.join("dataset.json"));
    std::fs::write(
        &raw,
        format!("Drug 1,Drug 2,Interaction Description\n{rows}"),
    )
    .expect("write raw csv");
    build(&raw, &out).expect("build succeeds");
    serde_json::from_str(&std::fs::read_to_string(&out).expect("output exists"))
        .expect("valid dataset json")
}

fn pair<'a>(dataset: &'a Dataset, a: &str, b: &str) -> &'a Interaction {
    dataset
        .interactions
        .iter()
        .find(|i| (i.from == a && i.to == b) || (i.from == b && i.to == a))
        .unwrap_or_else(|| panic!("pair {a}-{b} present"))
}

#[test]
fn real_classifier_grades_template_sentences() {
    let dataset = build_rows(
        "classifier",
        "Warfarin,Aspirin,\"Warfarin may increase the anticoagulant activities of Aspirin.\"\n\
         Methadone,Alprazolam,\"Methadone may increase the central nervous system depressant (CNS depressant) activities of Alprazolam.\"\n\
         Sotalol,Haloperidol,\"Sotalol may increase the QTc-prolonging activities of Haloperidol.\"\n\
         Simvastatin,Amiodarone,\"The metabolism of Simvastatin can be decreased when combined with Amiodarone.\"\n\
         Drug X,Drug Y,\"Drug X may increase the madeup activities of Drug Y.\"\n\
         Drug P,Drug Q,\"Something entirely unstructured.\"\n",
    );
    let warfarin = pair(&dataset, "warfarin", "aspirin");
    assert_eq!(warfarin.kind, "activity:anticoagulant");
    assert_eq!(
        warfarin.severity, "severe",
        "bleeding risk is graded severe"
    );
    assert_eq!(warfarin.severity_basis, "kind:activity:anticoagulant");

    let cns = pair(&dataset, "methadone", "alprazolam");
    assert_eq!(cns.kind, "cns-depressant");
    assert_eq!(cns.severity, "severe", "FDA boxed-warning class");

    assert_eq!(pair(&dataset, "sotalol", "haloperidol").severity, "severe");
    assert_eq!(
        pair(&dataset, "simvastatin", "amiodarone").severity,
        "moderate"
    );

    let unknown = pair(&dataset, "drug-x", "drug-y");
    assert_eq!(unknown.severity, "moderate");
    assert_eq!(unknown.severity_basis, "default:activity:madeup");

    assert_eq!(pair(&dataset, "drug-p", "drug-q").kind, "unclassified");
}

#[test]
fn onc_high_priority_pairs_are_contraindicated() {
    let dataset = build_rows(
        "onc",
        "Tizanidine,Ciprofloxacin,\"The metabolism of Tizanidine can be decreased when combined with Ciprofloxacin.\"\n\
         Phenelzine,Sertraline,\"Phenelzine may increase the serotonergic activities of Sertraline.\"\n\
         Sotalol,Quinidine,\"Sotalol may increase the QTc-prolonging activities of Quinidine.\"\n\
         Warfarin,Aspirin,\"Warfarin may increase the anticoagulant activities of Aspirin.\"\n",
    );
    let tizanidine = pair(&dataset, "tizanidine", "ciprofloxacin");
    assert_eq!(tizanidine.severity, "contraindicated");
    assert_eq!(tizanidine.severity_basis, "onc:13");
    assert_eq!(
        pair(&dataset, "phenelzine", "sertraline").severity_basis,
        "onc:4"
    );
    assert_eq!(
        pair(&dataset, "sotalol", "quinidine").severity_basis,
        "onc:8"
    );
    assert_eq!(
        pair(&dataset, "warfarin", "aspirin").severity,
        "severe",
        "non-ONC pairs keep their kind grade"
    );
}

#[test]
fn display_name_falls_back_to_the_id() {
    let engine = InteractionGraph::from_dataset(&fixture()).expect("valid dataset");
    assert_eq!(engine.display_name("a"), "Drug A");
    assert_eq!(engine.display_name("zz"), "zz");
}
