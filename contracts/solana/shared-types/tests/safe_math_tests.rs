#[cfg(test)]
mod safe_math_proptest {
    use localmoney_shared::{PercentageCalculator, SafeMath};
    use proptest::prelude::*;

    // Property-based tests for u64
    proptest! {
        #[test]
        fn test_u64_safe_add_commutative(a: u64, b: u64) {
            let result1 = a.safe_add(b);
            let result2 = b.safe_add(a);

            match (result1, result2) {
                (Ok(r1), Ok(r2)) => assert_eq!(r1, r2, "Addition should be commutative"),
                (Err(_), Err(_)) => {}, // Both overflow, which is expected
                _ => panic!("Inconsistent overflow behavior"),
            }
        }

        #[test]
        fn test_u64_safe_add_associative(a: u64, b: u64, c: u64) {
            let result1 = a.safe_add(b).and_then(|ab| ab.safe_add(c));
            let result2 = b.safe_add(c).and_then(|bc| a.safe_add(bc));

            match (result1, result2) {
                (Ok(r1), Ok(r2)) => assert_eq!(r1, r2, "Addition should be associative"),
                (Err(_), Err(_)) => {}, // Both overflow, which is expected
                _ => {}, // Different overflow points, which is acceptable
            }
        }

        #[test]
        fn test_u64_safe_mul_commutative(a: u64, b: u64) {
            let result1 = a.safe_mul(b);
            let result2 = b.safe_mul(a);

            match (result1, result2) {
                (Ok(r1), Ok(r2)) => assert_eq!(r1, r2, "Multiplication should be commutative"),
                (Err(_), Err(_)) => {}, // Both overflow, which is expected
                _ => panic!("Inconsistent overflow behavior"),
            }
        }

        #[test]
        fn test_u64_safe_sub_inverse_of_add(a: u64, b: u64) {
            if let Ok(sum) = a.safe_add(b) {
                if let Ok(diff) = sum.safe_sub(b) {
                    assert_eq!(diff, a, "Subtraction should be inverse of addition");
                }
            }
        }

        #[test]
        fn test_u64_safe_div_inverse_of_mul(a: u64, b in 1u64..=u64::MAX) {
            if let Ok(product) = a.safe_mul(b) {
                if let Ok(quotient) = product.safe_div(b) {
                    assert_eq!(quotient, a, "Division should be inverse of multiplication");
                }
            }
        }

        #[test]
        fn test_u64_safe_add_identity(a: u64) {
            assert_eq!(a.safe_add(0).unwrap(), a, "Adding 0 should return original value");
        }

        #[test]
        fn test_u64_safe_mul_identity(a: u64) {
            assert_eq!(a.safe_mul(1).unwrap(), a, "Multiplying by 1 should return original value");
        }

        #[test]
        fn test_u64_safe_mul_zero(a: u64) {
            assert_eq!(a.safe_mul(0).unwrap(), 0, "Multiplying by 0 should return 0");
        }
    }

    // Property-based tests for u128
    proptest! {
        #[test]
        fn test_u128_safe_add_commutative(a: u128, b: u128) {
            let result1 = a.safe_add(b);
            let result2 = b.safe_add(a);

            match (result1, result2) {
                (Ok(r1), Ok(r2)) => assert_eq!(r1, r2, "Addition should be commutative"),
                (Err(_), Err(_)) => {}, // Both overflow, which is expected
                _ => panic!("Inconsistent overflow behavior"),
            }
        }

        #[test]
        fn test_u128_safe_mul_distributive(a: u128, b: u128, c: u128) {
            // Test if a * (b + c) = (a * b) + (a * c)
            let left = b.safe_add(c).and_then(|sum| a.safe_mul(sum));
            let right = a.safe_mul(b)
                .and_then(|ab| a.safe_mul(c)
                    .and_then(|ac| ab.safe_add(ac)));

            if let (Ok(l), Ok(r)) = (left, right) {
                assert_eq!(l, r, "Multiplication should be distributive");
            }
            // Overflow at different points is acceptable
        }
    }

    // Property-based tests for i64
    proptest! {
        #[test]
        fn test_i64_safe_add_commutative(a: i64, b: i64) {
            let result1 = a.safe_add(b);
            let result2 = b.safe_add(a);

            match (result1, result2) {
                (Ok(r1), Ok(r2)) => assert_eq!(r1, r2, "Addition should be commutative"),
                (Err(_), Err(_)) => {}, // Both overflow, which is expected
                _ => panic!("Inconsistent overflow behavior"),
            }
        }

        #[test]
        fn test_i64_safe_sub_with_negatives(a: i64, b: i64) {
            let result = a.safe_sub(b);

            // Check that subtraction works correctly with negative numbers
            if let Ok(diff) = result {
                // If we add b back, we should get a
                if let Ok(sum) = diff.safe_add(b) {
                    assert_eq!(sum, a, "Subtraction and addition should be inverse operations");
                }
            }
        }

        #[test]
        fn test_i64_safe_mul_sign_rules(a: i64, b: i64) {
            if let Ok(product) = a.safe_mul(b) {
                let expected_sign = if (a < 0) != (b < 0) {
                    // Different signs => negative result
                    product <= 0
                } else {
                    // Same signs => positive result
                    product >= 0
                };
                assert!(expected_sign, "Sign rules for multiplication should hold");
            }
        }
    }

    // Property-based tests for percentage calculations
    proptest! {
        #[test]
        fn test_percentage_within_bounds(value: u64, basis_points in 0u16..=10000) {
            let result = PercentageCalculator::calculate_percentage(value, basis_points);

            if let Ok(percentage) = result {
                assert!(percentage <= value, "Percentage should not exceed original value");

                // Special cases
                if basis_points == 0 {
                    assert_eq!(percentage, 0, "0% should return 0");
                }
                if basis_points == 10000 {
                    assert_eq!(percentage, value, "100% should return original value");
                }
            }
        }

        #[test]
        fn test_percentage_monotonic(value: u64, bp1 in 0u16..=10000, bp2 in 0u16..=10000) {
            let result1 = PercentageCalculator::calculate_percentage(value, bp1);
            let result2 = PercentageCalculator::calculate_percentage(value, bp2);

            if let (Ok(p1), Ok(p2)) = (result1, result2) {
                if bp1 <= bp2 {
                    assert!(p1 <= p2, "Percentage should be monotonic");
                } else {
                    assert!(p1 >= p2, "Percentage should be monotonic");
                }
            }
        }

        #[test]
        fn test_basis_points_inverse(value in 1u64..=u64::MAX/10000) {
            // For small enough values, we should be able to round-trip
            let basis_points = 5000u16; // 50%

            if let Ok(half) = PercentageCalculator::calculate_percentage(value, basis_points) {
                if let Ok(calculated_bp) = PercentageCalculator::calculate_basis_points(half, value) {
                    // Allow for rounding error of 1 basis point
                    assert!((calculated_bp as i32 - basis_points as i32).abs() <= 1,
                           "Basis points calculation should be inverse of percentage");
                }
            }
        }

        #[test]
        fn test_basis_points_validation(basis_points: u16) {
            let result = PercentageCalculator::validate_basis_points(basis_points);

            if basis_points <= 10000 {
                assert!(result.is_ok(), "Valid basis points should pass validation");
            } else {
                assert!(result.is_err(), "Invalid basis points should fail validation");
            }
        }
    }

    // Edge case tests
    #[test]
    fn test_u64_overflow_detection() {
        assert!(u64::MAX.safe_add(1).is_err());
        assert!(u64::MAX.safe_add(u64::MAX).is_err());
        assert!(u64::MAX.safe_mul(2).is_err());
    }

    #[test]
    fn test_u64_underflow_detection() {
        assert!(0u64.safe_sub(1).is_err());
        assert!(10u64.safe_sub(11).is_err());
    }

    #[test]
    fn test_division_by_zero() {
        assert!(10u64.safe_div(0).is_err());
        assert!(0u64.safe_div(0).is_err());
        assert!(10u128.safe_div(0).is_err());
        assert!(10i64.safe_div(0).is_err());
        assert!(10i128.safe_div(0).is_err());
    }

    #[test]
    fn test_i64_overflow_detection() {
        assert!(i64::MAX.safe_add(1).is_err());
        assert!(i64::MIN.safe_sub(1).is_err());
        assert!(i64::MAX.safe_mul(2).is_err());
    }

    #[test]
    fn test_percentage_edge_cases() {
        // 0% of anything is 0
        assert_eq!(
            PercentageCalculator::calculate_percentage(1000, 0).unwrap(),
            0
        );

        // 100% of value is value
        assert_eq!(
            PercentageCalculator::calculate_percentage(1000, 10000).unwrap(),
            1000
        );

        // Test with max values - 100% of u64::MAX is just u64::MAX (no overflow)
        assert_eq!(
            PercentageCalculator::calculate_percentage(u64::MAX, 10000).unwrap(),
            u64::MAX
        );

        // But any percentage calculation that would overflow should fail
        // For example, trying to calculate a percentage where intermediate multiplication overflows
        assert!(PercentageCalculator::calculate_percentage(u64::MAX / 2 + 1, 20000).is_err());

        // Invalid basis points
        assert!(PercentageCalculator::calculate_percentage(1000, 10001).is_err());
    }

    #[test]
    fn test_basis_points_edge_cases() {
        // 0 out of anything is 0 basis points
        assert_eq!(
            PercentageCalculator::calculate_basis_points(0, 100).unwrap(),
            0
        );

        // Value equals whole is 10000 basis points (100%)
        assert_eq!(
            PercentageCalculator::calculate_basis_points(100, 100).unwrap(),
            10000
        );

        // Division by zero
        assert!(PercentageCalculator::calculate_basis_points(50, 0).is_err());

        // Part greater than whole
        assert!(PercentageCalculator::calculate_basis_points(150, 100).is_err());
    }
}
