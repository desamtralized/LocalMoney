use cosmwasm_std::{Deps, StdError, StdResult};

use crate::state::OFFERS_COUNT;
use localmoney_protocol::hub_utils::get_hub_config;
use localmoney_protocol::offer::{
    offers, OfferResponse, OffersCount,
};
use localmoney_protocol::profile::load_profile;

/// Queries the current state (offers count)
pub fn query_state(deps: Deps) -> StdResult<OffersCount> {
    OFFERS_COUNT.load(deps.storage)
}

/// Loads an offer by its ID with profile information
pub fn load_offer_by_id(deps: Deps, id: u64) -> StdResult<OfferResponse> {
    let hub_config = get_hub_config(deps);
    let offer = offers()
        .may_load(deps.storage, id)?
        .ok_or_else(|| StdError::not_found("Offer"))?;
    
    let profile = load_profile(
        &deps.querier,
        hub_config.profile_addr.to_string(),
        offer.owner.clone(),
    )?;
    
    Ok(OfferResponse { offer, profile })
}