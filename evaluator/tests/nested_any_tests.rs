use std::path::Path;

use quint_evaluator::{helpers, progress, simulator::SimulationConfig, Verbosity};

#[test]
fn nested_any_preserves_names_and_seeded_states() {
    let parsed = helpers::parse_from_path(
        Path::new("../quint/testFixture/simulator/nested_any.qnt"),
        "init",
        "step",
        Some("x >= 0"),
        None,
    )
    .unwrap();
    let result = parsed
        .simulate(
            SimulationConfig {
                steps: 8,
                samples: 1,
                n_traces: 1,
                seed: Some(1),
                store_metadata: true,
                verbosity: Verbosity::default(),
            },
            progress::no_report(),
        )
        .unwrap();
    let states = &result.best_traces[0].states;
    let expected_values = ["0", "2", "3", "5", "15", "25", "35", "45", "46"];
    let expected_actions = [
        "init", "Plain", "Plain", "Plain", "Nested", "Nested", "Nested", "Nested", "Plain",
    ];
    assert_eq!(states.len(), expected_values.len());
    for ((state, value), action) in states.iter().zip(expected_values).zip(expected_actions) {
        let record = state.value.as_record_map();
        assert_eq!(record.get("x").unwrap().as_int().to_string(), value);
        assert_eq!(
            record.get("mbt::actionTaken").unwrap().as_str().as_str(),
            action
        );
    }
}
