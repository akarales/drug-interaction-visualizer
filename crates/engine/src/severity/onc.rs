//! ONC high-priority contraindicated pairs with editorial value sets (layer 2).

/// One ONC high-priority interaction with editorial value sets (drug ids).
#[derive(Debug, Clone, Copy)]
pub struct OncRule {
    pub id: u8,
    pub label: &'static str,
    pub a: &'static [&'static str],
    pub b: &'static [&'static str],
}

const MAOIS: &[&str] = &[
    "phenelzine",
    "tranylcypromine",
    "isocarboxazid",
    "selegiline",
    "rasagiline",
    "safinamide",
    "linezolid",
    "procarbazine",
    "methylene-blue",
    "moclobemide",
];
const STRONG_CYP3A4_INHIBITORS: &[&str] = &[
    "clarithromycin",
    "indinavir",
    "itraconazole",
    "ketoconazole",
    "nelfinavir",
    "ritonavir",
    "saquinavir",
    "telithromycin",
    "voriconazole",
    "posaconazole",
    "cobicistat",
    "nefazodone",
    "lopinavir",
];
const PROTEASE_INHIBITORS: &[&str] = &[
    "atazanavir",
    "darunavir",
    "fosamprenavir",
    "indinavir",
    "lopinavir",
    "nelfinavir",
    "ritonavir",
    "saquinavir",
    "tipranavir",
];
const CYP3A4_AND_PIS: &[&str] = &[
    "clarithromycin",
    "erythromycin",
    "telithromycin",
    "itraconazole",
    "ketoconazole",
    "posaconazole",
    "voriconazole",
    "nefazodone",
    "cobicistat",
    "atazanavir",
    "darunavir",
    "fosamprenavir",
    "indinavir",
    "lopinavir",
    "nelfinavir",
    "ritonavir",
    "saquinavir",
    "tipranavir",
];
const CYP1A2_INHIBITORS: &[&str] = &["fluvoxamine", "ciprofloxacin", "enoxacin"];

/// The ONC list (JAMIA 2012, Table 1 as reproduced in PMC9218784).
pub const ONC_RULES: &[OncRule] = &[
    OncRule {
        id: 1,
        label: "Amphetamines + MAOIs",
        a: &[
            "amphetamine",
            "dextroamphetamine",
            "lisdexamfetamine",
            "benzphetamine",
            "phentermine",
        ],
        b: MAOIS,
    },
    OncRule {
        id: 2,
        label: "Atazanavir + PPIs",
        a: &["atazanavir"],
        b: &[
            "omeprazole",
            "esomeprazole",
            "lansoprazole",
            "dexlansoprazole",
            "pantoprazole",
            "rabeprazole",
        ],
    },
    OncRule {
        id: 3,
        label: "Febuxostat + azathioprine/mercaptopurine",
        a: &["febuxostat"],
        b: &["azathioprine", "mercaptopurine"],
    },
    OncRule {
        id: 4,
        label: "SSRIs + MAOIs",
        a: &[
            "fluoxetine",
            "sertraline",
            "paroxetine",
            "citalopram",
            "escitalopram",
            "fluvoxamine",
            "vilazodone",
        ],
        b: MAOIS,
    },
    OncRule {
        id: 5,
        label: "Irinotecan + strong CYP3A4 inhibitors",
        a: &["irinotecan"],
        b: STRONG_CYP3A4_INHIBITORS,
    },
    OncRule {
        id: 6,
        label: "Narcotic analgesics + MAOIs",
        a: &[
            "meperidine",
            "methadone",
            "tramadol",
            "tapentadol",
            "fentanyl",
            "dextromethorphan",
        ],
        b: MAOIS,
    },
    OncRule {
        id: 7,
        label: "Tricyclic antidepressants + MAOIs",
        a: &[
            "amitriptyline",
            "nortriptyline",
            "imipramine",
            "desipramine",
            "clomipramine",
            "doxepin",
            "protriptyline",
            "trimipramine",
            "amoxapine",
        ],
        b: MAOIS,
    },
    OncRule {
        id: 8,
        label: "High-risk QT-prolonging agents (pairwise)",
        a: &[
            "arsenic-trioxide",
            "disopyramide",
            "dofetilide",
            "ibutilide",
            "procainamide",
            "quinidine",
            "sotalol",
            "thioridazine",
        ],
        b: &[
            "arsenic-trioxide",
            "disopyramide",
            "dofetilide",
            "ibutilide",
            "procainamide",
            "quinidine",
            "sotalol",
            "thioridazine",
        ],
    },
    OncRule {
        id: 9,
        label: "Ramelteon + strong CYP1A2 inhibitors",
        a: &["ramelteon"],
        b: CYP1A2_INHIBITORS,
    },
    OncRule {
        id: 10,
        label: "Strong CYP3A4 inducers + protease inhibitors",
        a: &[
            "rifampicin",
            "rifapentine",
            "carbamazepine",
            "phenytoin",
            "enzalutamide",
            "mitotane",
        ],
        b: PROTEASE_INHIBITORS,
    },
    OncRule {
        id: 11,
        label: "Simvastatin/lovastatin + CYP3A4 inhibitors & PIs",
        a: &["simvastatin", "lovastatin"],
        b: CYP3A4_AND_PIS,
    },
    OncRule {
        id: 12,
        label: "Ergot alkaloids + CYP3A4 inhibitors & PIs",
        a: &[
            "ergotamine",
            "dihydroergotamine",
            "methylergometrine",
            "ergometrine",
        ],
        b: CYP3A4_AND_PIS,
    },
    OncRule {
        id: 13,
        label: "Tizanidine + CYP1A2 inhibitors",
        a: &["tizanidine"],
        b: CYP1A2_INHIBITORS,
    },
    OncRule {
        id: 14,
        label: "Tranylcypromine + procarbazine",
        a: &["tranylcypromine"],
        b: &["procarbazine"],
    },
    OncRule {
        id: 15,
        label: "Triptans + MAOIs",
        a: &[
            "sumatriptan",
            "rizatriptan",
            "zolmitriptan",
            "almotriptan",
            "eletriptan",
            "frovatriptan",
            "naratriptan",
        ],
        b: MAOIS,
    },
];

/// First ONC rule matching the unordered pair, if any.
pub fn onc_rule_for(x: &str, y: &str) -> Option<&'static OncRule> {
    ONC_RULES
        .iter()
        .find(|r| (r.a.contains(&x) && r.b.contains(&y)) || (r.a.contains(&y) && r.b.contains(&x)))
}

/// Every value-set id across the ONC rules (for the build report).
pub fn onc_value_set_ids() -> impl Iterator<Item = &'static str> {
    ONC_RULES
        .iter()
        .flat_map(|r| r.a.iter().chain(r.b.iter()).copied())
}
