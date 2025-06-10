use anchor_lang::prelude::*;
use std::fmt;

/// Fiat Currency enum with the 20 most popular global currencies
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub enum FiatCurrency {
    /// United States Dollar
    USD,
    /// Euro
    EUR,
    /// Japanese Yen
    JPY,
    /// British Pound Sterling
    GBP,
    /// Chinese Yuan
    CNY,
    /// Canadian Dollar
    CAD,
    /// Australian Dollar
    AUD,
    /// Swiss Franc
    CHF,
    /// Hong Kong Dollar
    HKD,
    /// Singapore Dollar
    SGD,
    /// Swedish Krona
    SEK,
    /// Norwegian Krone
    NOK,
    /// Mexican Peso
    MXN,
    /// New Zealand Dollar
    NZD,
    /// South African Rand
    ZAR,
    /// Turkish Lira
    TRY,
    /// Brazilian Real
    BRL,
    /// Indian Rupee
    INR,
    /// South Korean Won
    KRW,
    /// Russian Ruble
    RUB,
}

impl fmt::Display for FiatCurrency {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            FiatCurrency::USD => write!(f, "USD"),
            FiatCurrency::EUR => write!(f, "EUR"),
            FiatCurrency::JPY => write!(f, "JPY"),
            FiatCurrency::GBP => write!(f, "GBP"),
            FiatCurrency::CNY => write!(f, "CNY"),
            FiatCurrency::CAD => write!(f, "CAD"),
            FiatCurrency::AUD => write!(f, "AUD"),
            FiatCurrency::CHF => write!(f, "CHF"),
            FiatCurrency::HKD => write!(f, "HKD"),
            FiatCurrency::SGD => write!(f, "SGD"),
            FiatCurrency::SEK => write!(f, "SEK"),
            FiatCurrency::NOK => write!(f, "NOK"),
            FiatCurrency::MXN => write!(f, "MXN"),
            FiatCurrency::NZD => write!(f, "NZD"),
            FiatCurrency::ZAR => write!(f, "ZAR"),
            FiatCurrency::TRY => write!(f, "TRY"),
            FiatCurrency::BRL => write!(f, "BRL"),
            FiatCurrency::INR => write!(f, "INR"),
            FiatCurrency::KRW => write!(f, "KRW"),
            FiatCurrency::RUB => write!(f, "RUB"),
        }
    }
}

impl FiatCurrency {
    /// Get the currency symbol
    pub fn symbol(&self) -> &'static str {
        match self {
            FiatCurrency::USD => "$",
            FiatCurrency::EUR => "€",
            FiatCurrency::JPY => "¥",
            FiatCurrency::GBP => "£",
            FiatCurrency::CNY => "¥",
            FiatCurrency::CAD => "C$",
            FiatCurrency::AUD => "A$",
            FiatCurrency::CHF => "CHF",
            FiatCurrency::HKD => "HK$",
            FiatCurrency::SGD => "S$",
            FiatCurrency::SEK => "kr",
            FiatCurrency::NOK => "kr",
            FiatCurrency::MXN => "$",
            FiatCurrency::NZD => "NZ$",
            FiatCurrency::ZAR => "R",
            FiatCurrency::TRY => "₺",
            FiatCurrency::BRL => "R$",
            FiatCurrency::INR => "₹",
            FiatCurrency::KRW => "₩",
            FiatCurrency::RUB => "₽",
        }
    }

    /// Get the currency name
    pub fn name(&self) -> &'static str {
        match self {
            FiatCurrency::USD => "US Dollar",
            FiatCurrency::EUR => "Euro",
            FiatCurrency::JPY => "Japanese Yen",
            FiatCurrency::GBP => "British Pound",
            FiatCurrency::CNY => "Chinese Yuan",
            FiatCurrency::CAD => "Canadian Dollar",
            FiatCurrency::AUD => "Australian Dollar",
            FiatCurrency::CHF => "Swiss Franc",
            FiatCurrency::HKD => "Hong Kong Dollar",
            FiatCurrency::SGD => "Singapore Dollar",
            FiatCurrency::SEK => "Swedish Krona",
            FiatCurrency::NOK => "Norwegian Krone",
            FiatCurrency::MXN => "Mexican Peso",
            FiatCurrency::NZD => "New Zealand Dollar",
            FiatCurrency::ZAR => "South African Rand",
            FiatCurrency::TRY => "Turkish Lira",
            FiatCurrency::BRL => "Brazilian Real",
            FiatCurrency::INR => "Indian Rupee",
            FiatCurrency::KRW => "South Korean Won",
            FiatCurrency::RUB => "Russian Ruble",
        }
    }

    /// Get all supported currencies
    pub fn all() -> Vec<FiatCurrency> {
        vec![
            FiatCurrency::USD,
            FiatCurrency::EUR,
            FiatCurrency::JPY,
            FiatCurrency::GBP,
            FiatCurrency::CNY,
            FiatCurrency::CAD,
            FiatCurrency::AUD,
            FiatCurrency::CHF,
            FiatCurrency::HKD,
            FiatCurrency::SGD,
            FiatCurrency::SEK,
            FiatCurrency::NOK,
            FiatCurrency::MXN,
            FiatCurrency::NZD,
            FiatCurrency::ZAR,
            FiatCurrency::TRY,
            FiatCurrency::BRL,
            FiatCurrency::INR,
            FiatCurrency::KRW,
            FiatCurrency::RUB,
        ]
    }
}

impl Default for FiatCurrency {
    fn default() -> Self {
        FiatCurrency::USD
    }
}
