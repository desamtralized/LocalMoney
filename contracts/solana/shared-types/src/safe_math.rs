use anchor_lang::prelude::*;

/// SafeMath trait for checked arithmetic operations
pub trait SafeMath: Sized {
    /// Performs checked addition
    fn safe_add(self, rhs: Self) -> Result<Self>;

    /// Performs checked subtraction
    fn safe_sub(self, rhs: Self) -> Result<Self>;

    /// Performs checked multiplication
    fn safe_mul(self, rhs: Self) -> Result<Self>;

    /// Performs checked division
    fn safe_div(self, rhs: Self) -> Result<Self>;
}

/// Arithmetic error codes
#[error_code]
pub enum ArithmeticError {
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Arithmetic underflow")]
    Underflow,
    #[msg("Division by zero")]
    DivisionByZero,
}

// Implementation for u64
impl SafeMath for u64 {
    fn safe_add(self, rhs: Self) -> Result<Self> {
        self.checked_add(rhs)
            .ok_or_else(|| ArithmeticError::Overflow.into())
    }

    fn safe_sub(self, rhs: Self) -> Result<Self> {
        self.checked_sub(rhs)
            .ok_or_else(|| ArithmeticError::Underflow.into())
    }

    fn safe_mul(self, rhs: Self) -> Result<Self> {
        self.checked_mul(rhs)
            .ok_or_else(|| ArithmeticError::Overflow.into())
    }

    fn safe_div(self, rhs: Self) -> Result<Self> {
        if rhs == 0 {
            return err!(ArithmeticError::DivisionByZero);
        }
        self.checked_div(rhs)
            .ok_or_else(|| ArithmeticError::Overflow.into())
    }
}

// Implementation for u128
impl SafeMath for u128 {
    fn safe_add(self, rhs: Self) -> Result<Self> {
        self.checked_add(rhs)
            .ok_or_else(|| ArithmeticError::Overflow.into())
    }

    fn safe_sub(self, rhs: Self) -> Result<Self> {
        self.checked_sub(rhs)
            .ok_or_else(|| ArithmeticError::Underflow.into())
    }

    fn safe_mul(self, rhs: Self) -> Result<Self> {
        self.checked_mul(rhs)
            .ok_or_else(|| ArithmeticError::Overflow.into())
    }

    fn safe_div(self, rhs: Self) -> Result<Self> {
        if rhs == 0 {
            return err!(ArithmeticError::DivisionByZero);
        }
        self.checked_div(rhs)
            .ok_or_else(|| ArithmeticError::Overflow.into())
    }
}

// Implementation for i64
impl SafeMath for i64 {
    fn safe_add(self, rhs: Self) -> Result<Self> {
        self.checked_add(rhs)
            .ok_or_else(|| ArithmeticError::Overflow.into())
    }

    fn safe_sub(self, rhs: Self) -> Result<Self> {
        self.checked_sub(rhs)
            .ok_or_else(|| ArithmeticError::Underflow.into())
    }

    fn safe_mul(self, rhs: Self) -> Result<Self> {
        self.checked_mul(rhs)
            .ok_or_else(|| ArithmeticError::Overflow.into())
    }

    fn safe_div(self, rhs: Self) -> Result<Self> {
        if rhs == 0 {
            return err!(ArithmeticError::DivisionByZero);
        }
        self.checked_div(rhs)
            .ok_or_else(|| ArithmeticError::Overflow.into())
    }
}

// Implementation for i128
impl SafeMath for i128 {
    fn safe_add(self, rhs: Self) -> Result<Self> {
        self.checked_add(rhs)
            .ok_or_else(|| ArithmeticError::Overflow.into())
    }

    fn safe_sub(self, rhs: Self) -> Result<Self> {
        self.checked_sub(rhs)
            .ok_or_else(|| ArithmeticError::Underflow.into())
    }

    fn safe_mul(self, rhs: Self) -> Result<Self> {
        self.checked_mul(rhs)
            .ok_or_else(|| ArithmeticError::Overflow.into())
    }

    fn safe_div(self, rhs: Self) -> Result<Self> {
        if rhs == 0 {
            return err!(ArithmeticError::DivisionByZero);
        }
        self.checked_div(rhs)
            .ok_or_else(|| ArithmeticError::Overflow.into())
    }
}

// Implementation for u32
impl SafeMath for u32 {
    fn safe_add(self, rhs: Self) -> Result<Self> {
        self.checked_add(rhs)
            .ok_or_else(|| ArithmeticError::Overflow.into())
    }

    fn safe_sub(self, rhs: Self) -> Result<Self> {
        self.checked_sub(rhs)
            .ok_or_else(|| ArithmeticError::Underflow.into())
    }

    fn safe_mul(self, rhs: Self) -> Result<Self> {
        self.checked_mul(rhs)
            .ok_or_else(|| ArithmeticError::Overflow.into())
    }

    fn safe_div(self, rhs: Self) -> Result<Self> {
        if rhs == 0 {
            return err!(ArithmeticError::DivisionByZero);
        }
        self.checked_div(rhs)
            .ok_or_else(|| ArithmeticError::Overflow.into())
    }
}

// Implementation for u16
impl SafeMath for u16 {
    fn safe_add(self, rhs: Self) -> Result<Self> {
        self.checked_add(rhs)
            .ok_or_else(|| ArithmeticError::Overflow.into())
    }

    fn safe_sub(self, rhs: Self) -> Result<Self> {
        self.checked_sub(rhs)
            .ok_or_else(|| ArithmeticError::Underflow.into())
    }

    fn safe_mul(self, rhs: Self) -> Result<Self> {
        self.checked_mul(rhs)
            .ok_or_else(|| ArithmeticError::Overflow.into())
    }

    fn safe_div(self, rhs: Self) -> Result<Self> {
        if rhs == 0 {
            return err!(ArithmeticError::DivisionByZero);
        }
        self.checked_div(rhs)
            .ok_or_else(|| ArithmeticError::Overflow.into())
    }
}

// Implementation for u8
impl SafeMath for u8 {
    fn safe_add(self, rhs: Self) -> Result<Self> {
        self.checked_add(rhs)
            .ok_or_else(|| ArithmeticError::Overflow.into())
    }

    fn safe_sub(self, rhs: Self) -> Result<Self> {
        self.checked_sub(rhs)
            .ok_or_else(|| ArithmeticError::Underflow.into())
    }

    fn safe_mul(self, rhs: Self) -> Result<Self> {
        self.checked_mul(rhs)
            .ok_or_else(|| ArithmeticError::Overflow.into())
    }

    fn safe_div(self, rhs: Self) -> Result<Self> {
        if rhs == 0 {
            return err!(ArithmeticError::DivisionByZero);
        }
        self.checked_div(rhs)
            .ok_or_else(|| ArithmeticError::Overflow.into())
    }
}

/// Helper functions for percentage calculations
pub struct PercentageCalculator;

impl PercentageCalculator {
    /// Calculate percentage of a value (basis points)
    /// basis_points must be between 0 and 10000 (0% to 100%)
    pub fn calculate_percentage(value: u64, basis_points: u16) -> Result<u64> {
        require!(basis_points <= 10000, ArithmeticError::Overflow);

        let value_u128 = value as u128;
        let basis_points_u128 = basis_points as u128;

        let result = value_u128.safe_mul(basis_points_u128)?.safe_div(10000)?;

        // Check if result fits in u64
        if result > u64::MAX as u128 {
            return err!(ArithmeticError::Overflow);
        }

        Ok(result as u64)
    }

    /// Calculate the basis points (percentage * 100) that one value represents of another
    /// Returns basis points (0-10000)
    pub fn calculate_basis_points(part: u64, whole: u64) -> Result<u16> {
        if whole == 0 {
            return err!(ArithmeticError::DivisionByZero);
        }

        let part_u128 = part as u128;
        let whole_u128 = whole as u128;

        let basis_points = part_u128.safe_mul(10000)?.safe_div(whole_u128)?;

        // Check if result fits in u16 and is valid (0-10000)
        if basis_points > 10000 {
            return err!(ArithmeticError::Overflow);
        }

        Ok(basis_points as u16)
    }

    /// Validate that basis points are within valid range (0-10000)
    pub fn validate_basis_points(basis_points: u16) -> Result<()> {
        require!(basis_points <= 10000, ArithmeticError::Overflow);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_u64_safe_add() {
        assert_eq!(5u64.safe_add(3).unwrap(), 8);
        assert!(u64::MAX.safe_add(1).is_err());
    }

    #[test]
    fn test_u64_safe_sub() {
        assert_eq!(5u64.safe_sub(3).unwrap(), 2);
        assert!(0u64.safe_sub(1).is_err());
    }

    #[test]
    fn test_u64_safe_mul() {
        assert_eq!(5u64.safe_mul(3).unwrap(), 15);
        assert!(u64::MAX.safe_mul(2).is_err());
    }

    #[test]
    fn test_u64_safe_div() {
        assert_eq!(10u64.safe_div(2).unwrap(), 5);
        assert!(10u64.safe_div(0).is_err());
    }

    #[test]
    fn test_u128_operations() {
        assert_eq!(100u128.safe_add(50).unwrap(), 150);
        assert_eq!(100u128.safe_sub(50).unwrap(), 50);
        assert_eq!(100u128.safe_mul(2).unwrap(), 200);
        assert_eq!(100u128.safe_div(4).unwrap(), 25);
        assert!(u128::MAX.safe_add(1).is_err());
    }

    #[test]
    fn test_i64_operations() {
        assert_eq!(5i64.safe_add(3).unwrap(), 8);
        assert_eq!(5i64.safe_sub(3).unwrap(), 2);
        assert_eq!(5i64.safe_mul(3).unwrap(), 15);
        assert_eq!(10i64.safe_div(2).unwrap(), 5);
        assert!(i64::MAX.safe_add(1).is_err());
        assert!(i64::MIN.safe_sub(1).is_err());
    }

    #[test]
    fn test_percentage_calculator() {
        // 10% of 1000 = 100
        assert_eq!(
            PercentageCalculator::calculate_percentage(1000, 1000).unwrap(),
            100
        );

        // 50% of 200 = 100
        assert_eq!(
            PercentageCalculator::calculate_percentage(200, 5000).unwrap(),
            100
        );

        // 100% of 1000 = 1000
        assert_eq!(
            PercentageCalculator::calculate_percentage(1000, 10000).unwrap(),
            1000
        );

        // Invalid basis points (> 10000)
        assert!(PercentageCalculator::calculate_percentage(1000, 10001).is_err());
    }

    #[test]
    fn test_calculate_basis_points() {
        // 50 out of 100 = 5000 basis points (50%)
        assert_eq!(
            PercentageCalculator::calculate_basis_points(50, 100).unwrap(),
            5000
        );

        // 25 out of 100 = 2500 basis points (25%)
        assert_eq!(
            PercentageCalculator::calculate_basis_points(25, 100).unwrap(),
            2500
        );

        // 100 out of 100 = 10000 basis points (100%)
        assert_eq!(
            PercentageCalculator::calculate_basis_points(100, 100).unwrap(),
            10000
        );

        // Division by zero
        assert!(PercentageCalculator::calculate_basis_points(50, 0).is_err());
    }

    #[test]
    fn test_validate_basis_points() {
        assert!(PercentageCalculator::validate_basis_points(0).is_ok());
        assert!(PercentageCalculator::validate_basis_points(5000).is_ok());
        assert!(PercentageCalculator::validate_basis_points(10000).is_ok());
        assert!(PercentageCalculator::validate_basis_points(10001).is_err());
    }

    #[test]
    fn test_u32_operations() {
        assert_eq!(100u32.safe_add(50).unwrap(), 150);
        assert_eq!(100u32.safe_sub(50).unwrap(), 50);
        assert_eq!(100u32.safe_mul(2).unwrap(), 200);
        assert_eq!(100u32.safe_div(4).unwrap(), 25);
        assert!(u32::MAX.safe_add(1).is_err());
        assert!(0u32.safe_sub(1).is_err());
    }

    #[test]
    fn test_u16_operations() {
        assert_eq!(100u16.safe_add(50).unwrap(), 150);
        assert_eq!(100u16.safe_sub(50).unwrap(), 50);
        assert_eq!(100u16.safe_mul(2).unwrap(), 200);
        assert_eq!(100u16.safe_div(4).unwrap(), 25);
        assert!(u16::MAX.safe_add(1).is_err());
        assert!(0u16.safe_sub(1).is_err());
    }

    #[test]
    fn test_u8_operations() {
        assert_eq!(100u8.safe_add(50).unwrap(), 150);
        assert_eq!(100u8.safe_sub(50).unwrap(), 50);
        assert_eq!(100u8.safe_mul(2).unwrap(), 200);
        assert_eq!(100u8.safe_div(4).unwrap(), 25);
        assert!(u8::MAX.safe_add(1).is_err());
        assert!(0u8.safe_sub(1).is_err());
        assert!(200u8.safe_add(200).is_err());
    }
}
