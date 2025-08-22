use anchor_lang::prelude::*;
use core::marker::PhantomData;

#[derive(Clone)]
pub struct SmallVec<const N: usize, T: Clone + AnchorSerialize + AnchorDeserialize> {
    len: u8,
    data: [Option<T>; N],
    _phantom: PhantomData<T>,
}

impl<const N: usize, T: Clone + AnchorSerialize + AnchorDeserialize + Default> SmallVec<N, T> {
    pub fn new() -> Self {
        let mut data = Vec::with_capacity(N);
        for _ in 0..N {
            data.push(None);
        }
        
        Self {
            len: 0,
            data: data.try_into().unwrap_or_else(|_| panic!("Invalid array size")),
            _phantom: PhantomData,
        }
    }
    
    pub fn push(&mut self, item: T) -> Result<()> {
        require!(
            (self.len as usize) < N,
            ErrorCode::AccountDidNotSerialize
        );
        
        self.data[self.len as usize] = Some(item);
        self.len += 1;
        Ok(())
    }
    
    pub fn pop(&mut self) -> Option<T> {
        if self.len == 0 {
            None
        } else {
            self.len -= 1;
            self.data[self.len as usize].take()
        }
    }
    
    pub fn get(&self, index: usize) -> Option<&T> {
        if index < self.len as usize {
            self.data[index].as_ref()
        } else {
            None
        }
    }
    
    pub fn get_mut(&mut self, index: usize) -> Option<&mut T> {
        if index < self.len as usize {
            self.data[index].as_mut()
        } else {
            None
        }
    }
    
    pub fn iter(&self) -> impl Iterator<Item = &T> {
        self.data[..self.len as usize]
            .iter()
            .filter_map(|item| item.as_ref())
    }
    
    pub fn iter_mut(&mut self) -> impl Iterator<Item = &mut T> {
        self.data[..self.len as usize]
            .iter_mut()
            .filter_map(|item| item.as_mut())
    }
    
    pub fn contains(&self, item: &T) -> bool 
    where
        T: PartialEq,
    {
        self.iter().any(|x| x == item)
    }
    
    pub fn remove(&mut self, index: usize) -> Result<T> {
        require!(
            index < self.len as usize,
            ErrorCode::AccountDidNotSerialize
        );
        
        let item = self.data[index]
            .take()
            .ok_or(ErrorCode::AccountDidNotSerialize)?;
        
        // Shift elements left
        for i in index..self.len as usize - 1 {
            self.data[i] = self.data[i + 1].take();
        }
        
        self.len -= 1;
        Ok(item)
    }
    
    pub fn clear(&mut self) {
        for i in 0..self.len as usize {
            self.data[i] = None;
        }
        self.len = 0;
    }
    
    pub fn is_empty(&self) -> bool {
        self.len == 0
    }
    
    pub fn is_full(&self) -> bool {
        self.len as usize == N
    }
    
    pub fn len(&self) -> usize {
        self.len as usize
    }
    
    pub fn capacity(&self) -> usize {
        N
    }
    
    pub fn remaining_capacity(&self) -> usize {
        N - self.len as usize
    }
}

impl<const N: usize, T> Default for SmallVec<N, T>
where
    T: Clone + AnchorSerialize + AnchorDeserialize + Default,
{
    fn default() -> Self {
        Self::new()
    }
}

impl<const N: usize, T> AnchorSerialize for SmallVec<N, T>
where
    T: Clone + AnchorSerialize + AnchorDeserialize,
{
    fn serialize<W: std::io::Write>(&self, writer: &mut W) -> std::io::Result<()> {
        self.len.serialize(writer)?;
        for i in 0..N {
            self.data[i].serialize(writer)?;
        }
        Ok(())
    }
}

impl<const N: usize, T> AnchorDeserialize for SmallVec<N, T>
where
    T: Clone + AnchorSerialize + AnchorDeserialize,
{
    fn deserialize(buf: &mut &[u8]) -> std::io::Result<Self> {
        let len = u8::deserialize(buf)?;
        let mut data = Vec::with_capacity(N);
        
        for _ in 0..N {
            data.push(Option::<T>::deserialize(buf)?);
        }
        
        let mut array = Vec::new();
        for i in 0..N {
            array.push(data.get(i).cloned().unwrap_or(None));
        }
        
        Ok(Self {
            len,
            data: array.try_into().unwrap_or_else(|_| panic!("Invalid array size")),
            _phantom: PhantomData,
        })
    }
    
    fn deserialize_reader<R: std::io::Read>(reader: &mut R) -> std::io::Result<Self> {
        let mut buf = Vec::new();
        reader.read_to_end(&mut buf)?;
        let mut slice = &buf[..];
        Self::deserialize(&mut slice)
    }
}

// Use for small collections
pub type SmallArbitratorList = SmallVec<10, Pubkey>;

// Use for supported tokens
pub type SupportedTokens = SmallVec<20, TokenInfo>;

#[derive(Clone, AnchorSerialize, AnchorDeserialize, Default, PartialEq)]
pub struct TokenInfo {
    pub mint: Pubkey,
    pub decimals: u8,
    pub symbol: [u8; 4],
}

impl TokenInfo {
    pub fn new(mint: Pubkey, decimals: u8, symbol: &str) -> Self {
        let mut symbol_bytes = [0u8; 4];
        let symbol_slice = symbol.as_bytes();
        let len = symbol_slice.len().min(4);
        symbol_bytes[..len].copy_from_slice(&symbol_slice[..len]);
        
        Self {
            mint,
            decimals,
            symbol: symbol_bytes,
        }
    }
    
    pub fn symbol_str(&self) -> String {
        String::from_utf8_lossy(&self.symbol)
            .trim_end_matches('\0')
            .to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_small_vec_basic() {
        let mut vec = SmallVec::<5, u32>::new();
        assert!(vec.is_empty());
        assert_eq!(vec.len(), 0);
        assert_eq!(vec.capacity(), 5);
        
        vec.push(1).unwrap();
        vec.push(2).unwrap();
        vec.push(3).unwrap();
        
        assert_eq!(vec.len(), 3);
        assert!(!vec.is_empty());
        assert!(!vec.is_full());
        
        assert_eq!(vec.get(0), Some(&1));
        assert_eq!(vec.get(1), Some(&2));
        assert_eq!(vec.get(2), Some(&3));
        assert_eq!(vec.get(3), None);
    }
    
    #[test]
    fn test_small_vec_full() {
        let mut vec = SmallVec::<3, u32>::new();
        
        vec.push(1).unwrap();
        vec.push(2).unwrap();
        vec.push(3).unwrap();
        
        assert!(vec.is_full());
        assert!(vec.push(4).is_err());
    }
    
    #[test]
    fn test_small_vec_remove() {
        let mut vec = SmallVec::<5, u32>::new();
        
        vec.push(1).unwrap();
        vec.push(2).unwrap();
        vec.push(3).unwrap();
        vec.push(4).unwrap();
        
        let removed = vec.remove(1).unwrap();
        assert_eq!(removed, 2);
        assert_eq!(vec.len(), 3);
        
        assert_eq!(vec.get(0), Some(&1));
        assert_eq!(vec.get(1), Some(&3));
        assert_eq!(vec.get(2), Some(&4));
    }
    
    #[test]
    fn test_token_info() {
        let mint = Pubkey::new_unique();
        let token = TokenInfo::new(mint, 9, "USDC");
        
        assert_eq!(token.mint, mint);
        assert_eq!(token.decimals, 9);
        assert_eq!(token.symbol_str(), "USDC");
    }
}