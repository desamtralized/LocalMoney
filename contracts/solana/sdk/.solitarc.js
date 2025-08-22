const path = require('path');

module.exports = {
  idlDir: path.join(__dirname, 'src/types'),
  sdkDir: path.join(__dirname, 'src/generated'),
  binaryInstallDir: path.join(__dirname, '.solita'),
  programName: 'localmoney',
  programId: 'LOCAL11111111111111111111111111111111111111',
  idls: [
    { 
      name: 'hub', 
      programId: 'AJ6C5CHNQADfT2pJ9bQLx1rn5bKmYj1w1DnssmhXGHKF',
      filepath: path.join(__dirname, 'src/types/hub.json')
    },
    { 
      name: 'offer', 
      programId: 'Gvypc9RLNbCPLUw9wvRT3fYCcNKMZyLLuRdpvDeCpN9W',
      filepath: path.join(__dirname, 'src/types/offer.json')
    },
    { 
      name: 'price', 
      programId: 'Jn1xJ1tTEoQ5mdSkHJcWcgA9HTiKmuHqCLQrhVCnQxb',
      filepath: path.join(__dirname, 'src/types/price.json')
    },
    { 
      name: 'profile', 
      programId: 'H2NTK2NqRQBTgvd9wYpAUUndcBGgkCtiCHQJkCQP5xGd',
      filepath: path.join(__dirname, 'src/types/profile.json')
    },
    { 
      name: 'trade', 
      programId: '5osZqhJj2SYGDHtUre2wpWiCFoBZQFmQ4x5b4Ln2TQQM',
      filepath: path.join(__dirname, 'src/types/trade.json')
    },
  ],
};