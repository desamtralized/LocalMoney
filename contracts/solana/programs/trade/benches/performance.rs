use criterion::{black_box, criterion_group, criterion_main, Criterion};

fn benchmark_basic(c: &mut Criterion) {
    c.bench_function("simple_test", |b| {
        b.iter(|| {
            let sum = black_box(1) + black_box(2);
            black_box(sum);
        });
    });
}

criterion_group!(benches, benchmark_basic);
criterion_main!(benches);