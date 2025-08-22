use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};
use localmoney_shared::*;
use anchor_lang::prelude::*;

fn benchmark_state_transitions(c: &mut Criterion) {
    let mut group = c.benchmark_group("state_transitions");
    
    let mut history = BoundedStateHistory::new();
    
    group.bench_function("single_transition", |b| {
        b.iter(|| {
            let item = TradeStateItem {
                actor: black_box(Pubkey::new_unique()),
                state: black_box(TradeState::RequestAccepted),
                timestamp: black_box(1000),
            };
            history.push(item).unwrap();
        });
    });
    
    group.bench_function("validate_transition", |b| {
        let from_state = TradeState::RequestCreated;
        let to_state = TradeState::RequestAccepted;
        
        b.iter(|| {
            // Simulate validation logic
            let valid = matches!(
                (&from_state, &to_state),
                (TradeState::RequestCreated, TradeState::RequestAccepted)
            );
            black_box(valid);
        });
    });
    
    group.finish();
}

fn benchmark_history_operations(c: &mut Criterion) {
    let mut group = c.benchmark_group("history_operations");
    
    // Test different history sizes
    for size in [10, 20, 50, 100].iter() {
        let mut history = StateHistory::<100>::new();
        
        // Fill history
        for i in 0..*size {
            let entry = StateHistoryEntry {
                from_state: TradeState::RequestCreated,
                to_state: TradeState::RequestAccepted,
                actor: Pubkey::new_unique(),
                timestamp: i,
                reason: StateChangeReason::UserAction,
            };
            history.push(entry).unwrap();
        }
        
        group.bench_with_input(
            BenchmarkId::new("push", size),
            size,
            |b, _| {
                b.iter(|| {
                    let entry = StateHistoryEntry {
                        from_state: black_box(TradeState::RequestCreated),
                        to_state: black_box(TradeState::RequestAccepted),
                        actor: black_box(Pubkey::new_unique()),
                        timestamp: black_box(1000),
                        reason: black_box(StateChangeReason::UserAction),
                    };
                    history.push(entry).unwrap();
                });
            },
        );
        
        group.bench_with_input(
            BenchmarkId::new("find_by_actor", size),
            size,
            |b, _| {
                let actor = Pubkey::new_unique();
                b.iter(|| {
                    history.find_by_actor(black_box(&actor));
                });
            },
        );
        
        group.bench_with_input(
            BenchmarkId::new("iterate", size),
            size,
            |b, _| {
                b.iter(|| {
                    let count = history.iter().count();
                    black_box(count);
                });
            },
        );
    }
    
    group.finish();
}

fn benchmark_small_vec(c: &mut Criterion) {
    let mut group = c.benchmark_group("small_vec");
    
    group.bench_function("push", |b| {
        let mut vec = SmallVec::<10, Pubkey>::new();
        b.iter(|| {
            if !vec.is_full() {
                vec.push(black_box(Pubkey::new_unique())).unwrap();
            } else {
                vec.clear();
                vec.push(black_box(Pubkey::new_unique())).unwrap();
            }
        });
    });
    
    group.bench_function("pop", |b| {
        let mut vec = SmallVec::<10, Pubkey>::new();
        for _ in 0..5 {
            vec.push(Pubkey::new_unique()).unwrap();
        }
        
        b.iter(|| {
            if let Some(item) = vec.pop() {
                black_box(item);
                vec.push(Pubkey::new_unique()).unwrap();
            }
        });
    });
    
    group.bench_function("contains", |b| {
        let mut vec = SmallVec::<10, Pubkey>::new();
        let target = Pubkey::new_unique();
        vec.push(target).unwrap();
        
        for _ in 1..10 {
            vec.push(Pubkey::new_unique()).unwrap();
        }
        
        b.iter(|| {
            vec.contains(black_box(&target));
        });
    });
    
    group.bench_function("remove", |b| {
        let mut vec = SmallVec::<10, Pubkey>::new();
        
        b.iter(|| {
            // Reset vec
            vec.clear();
            for _ in 0..10 {
                vec.push(Pubkey::new_unique()).unwrap();
            }
            
            // Remove from middle
            vec.remove(black_box(5)).unwrap();
        });
    });
    
    group.finish();
}

fn benchmark_safe_math(c: &mut Criterion) {
    let mut group = c.benchmark_group("safe_math");
    
    group.bench_function("safe_add", |b| {
        let a = 1000000u64;
        let b = 2000000u64;
        
        b.iter(|| {
            a.safe_add(black_box(b)).unwrap();
        });
    });
    
    group.bench_function("safe_mul", |b| {
        let a = 1000u64;
        let b = 2000u64;
        
        b.iter(|| {
            a.safe_mul(black_box(b)).unwrap();
        });
    });
    
    group.bench_function("percentage_calculation", |b| {
        let calc = PercentageCalculator::new(10000);
        let amount = 1000000u64;
        let percentage = 250u16; // 2.5%
        
        b.iter(|| {
            calc.calculate(black_box(amount), black_box(percentage)).unwrap();
        });
    });
    
    group.finish();
}

fn benchmark_audit_trail(c: &mut Criterion) {
    let mut group = c.benchmark_group("audit_trail");
    
    let mut trail = AuditTrail::new(1000);
    
    group.bench_function("record_action", |b| {
        let mut metadata = std::collections::BTreeMap::new();
        metadata.insert("key".to_string(), "value".to_string());
        
        b.iter(|| {
            trail.record_action(
                black_box(1),
                black_box("TEST_ACTION"),
                black_box(Pubkey::new_unique()),
                black_box(&metadata),
            ).unwrap();
        });
    });
    
    // Fill trail for query benchmarks
    for i in 0..100 {
        let mut metadata = std::collections::BTreeMap::new();
        metadata.insert("test".to_string(), i.to_string());
        
        trail.record_action(
            i % 10,
            "BENCHMARK",
            Pubkey::new_unique(),
            &metadata,
        ).unwrap();
    }
    
    group.bench_function("get_entries_for_trade", |b| {
        b.iter(|| {
            trail.get_entries_for_trade(black_box(5));
        });
    });
    
    group.bench_function("export_json", |b| {
        b.iter(|| {
            let json = trail.export_json();
            black_box(json);
        });
    });
    
    group.finish();
}

fn benchmark_reallocation(c: &mut Criterion) {
    let mut group = c.benchmark_group("reallocation");
    
    struct TestData {
        size: usize,
    }
    
    impl Reallocatable for TestData {
        const MIN_SIZE: usize = 100;
        const GROWTH_FACTOR: usize = 256;
        
        fn required_size(&self) -> usize {
            self.size
        }
        
        fn can_reallocate(&self) -> bool {
            true
        }
    }
    
    group.bench_function("required_size_calculation", |b| {
        let data = TestData { size: 1000 };
        
        b.iter(|| {
            let size = data.required_size();
            black_box(size);
        });
    });
    
    group.bench_function("can_reallocate_check", |b| {
        let data = TestData { size: 1000 };
        
        b.iter(|| {
            let can = data.can_reallocate();
            black_box(can);
        });
    });
    
    group.finish();
}

fn benchmark_serialization(c: &mut Criterion) {
    let mut group = c.benchmark_group("serialization");
    
    // SmallVec serialization
    group.bench_function("small_vec_serialize", |b| {
        let mut vec = SmallVec::<10, Pubkey>::new();
        for _ in 0..5 {
            vec.push(Pubkey::new_unique()).unwrap();
        }
        
        b.iter(|| {
            let bytes = vec.try_to_vec().unwrap();
            black_box(bytes);
        });
    });
    
    // StateHistory serialization
    group.bench_function("state_history_serialize", |b| {
        let mut history = StateHistory::<10>::new();
        for i in 0..5 {
            let entry = StateHistoryEntry {
                from_state: TradeState::RequestCreated,
                to_state: TradeState::RequestAccepted,
                actor: Pubkey::new_unique(),
                timestamp: i,
                reason: StateChangeReason::UserAction,
            };
            history.push(entry).unwrap();
        }
        
        b.iter(|| {
            let bytes = history.try_to_vec().unwrap();
            black_box(bytes);
        });
    });
    
    group.finish();
}

criterion_group!(
    benches,
    benchmark_state_transitions,
    benchmark_history_operations,
    benchmark_small_vec,
    benchmark_safe_math,
    benchmark_audit_trail,
    benchmark_reallocation,
    benchmark_serialization
);

criterion_main!(benches);