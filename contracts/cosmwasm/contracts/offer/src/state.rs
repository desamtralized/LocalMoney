use cosmwasm_std::Addr;
use cw_storage_plus::{Index, IndexList, IndexedMap, Item, MultiIndex};

use localmoney_protocol::offer::{OffersCount, TradeAddr};

/// The storage key for offers count; note that cw-storage-plus items use &str keys.
pub const OFFERS_COUNT: Item<OffersCount> = Item::new("offers_count_v0_4_1");

/// TradeIndexes now uses the new generic ordering:
///   MultiIndex<'a, T, K, P> where:
///   - T is the main data type (TradeAddr),
///   - K is the index key type (Addr, in this case),
///   - P is the primary key type (here a Vec<u8>).
pub struct TradeIndexes<'a> {
    pub seller: MultiIndex<'a, Addr, TradeAddr, Vec<u8>>,
    pub buyer: MultiIndex<'a, Addr, TradeAddr, Vec<u8>>,
    pub arbitrator: MultiIndex<'a, Addr, TradeAddr, Vec<u8>>,
}

impl<'a> IndexList<TradeAddr> for TradeIndexes<'a> {
    fn get_indexes(&'_ self) -> Box<dyn Iterator<Item = &'_ dyn Index<TradeAddr>> + '_> {
        let v: Vec<&dyn Index<TradeAddr>> = vec![&self.seller, &self.buyer, &self.arbitrator];
        Box::new(v.into_iter())
    }
}

/// Returns an IndexedMap for TradeAddr objects with the new index types.
/// The primary map key is a &str (typically a unique identifier), and
/// the indexes extract the seller, buyer, and arbitrator fields.
pub fn trades() -> IndexedMap<&'static str, TradeAddr, TradeIndexes<'static>> {
    let indexes = TradeIndexes {
        seller: MultiIndex::new(
            |_pk, d: &TradeAddr| d.seller.clone(),
            "trades",
            "trades__seller",
        ),
        buyer: MultiIndex::new(
            |_pk, d: &TradeAddr| d.buyer.clone(),
            "trades",
            "trades__buyer",
        ),
        arbitrator: MultiIndex::new(
            |_pk, d: &TradeAddr| d.arbitrator.clone(),
            "trades",
            "trades__arbitrator",
        ),
    };
    IndexedMap::new("trades", indexes)
}
