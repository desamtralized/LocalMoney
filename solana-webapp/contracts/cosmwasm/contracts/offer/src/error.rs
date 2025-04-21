use cosmwasm_std::StdError;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("Unauthorized")]
    Unauthorized {},

    #[error("Hub already registered")]
    HubAlreadyRegistered {},
}

impl From<StdError> for ContractError {
    fn from(error: StdError) -> Self {
        ContractError::Std(error)
    }
}
