use anchor_lang::prelude::*;
use super::SharedTypeError;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct BoundedString {
    pub value: String,
}

impl BoundedString {
    pub const MAX_LEN: usize = 200;
    
    pub fn new(s: String) -> Result<Self> {
        require!(
            s.len() <= Self::MAX_LEN,
            SharedTypeError::StringTooLong
        );
        Ok(Self { value: s })
    }
    
    pub fn from_option(opt: Option<String>) -> Result<Option<Self>> {
        match opt {
            Some(s) => Ok(Some(Self::new(s)?)),
            None => Ok(None),
        }
    }
    
    pub fn to_option(opt: Option<Self>) -> Option<String> {
        opt.map(|bs| bs.value)
    }
    
    pub const fn space() -> usize {
        4 + Self::MAX_LEN // 4 bytes for length + max string length
    }
    
    pub const fn option_space() -> usize {
        1 + Self::space() // 1 byte for Option + BoundedString space
    }
}

impl PartialEq for BoundedString {
    fn eq(&self, other: &Self) -> bool {
        self.value == other.value
    }
}

impl Eq for BoundedString {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bounded_string_within_limit() {
        let s = "Hello, World!".to_string();
        let bounded = BoundedString::new(s.clone()).unwrap();
        assert_eq!(bounded.value, s);
    }

    #[test]
    fn test_bounded_string_at_limit() {
        let s = "x".repeat(200);
        let bounded = BoundedString::new(s.clone()).unwrap();
        assert_eq!(bounded.value, s);
    }

    #[test]
    fn test_bounded_string_exceeds_limit() {
        let s = "x".repeat(201);
        let result = BoundedString::new(s);
        assert!(result.is_err());
    }

    #[test]
    fn test_bounded_string_from_option() {
        let s = Some("test".to_string());
        let bounded = BoundedString::from_option(s).unwrap();
        assert!(bounded.is_some());
        assert_eq!(bounded.unwrap().value, "test");
        
        let none: Option<String> = None;
        let bounded = BoundedString::from_option(none).unwrap();
        assert!(bounded.is_none());
    }

    #[test]
    fn test_bounded_string_space_calculation() {
        assert_eq!(BoundedString::space(), 204);
        assert_eq!(BoundedString::option_space(), 205);
    }
}