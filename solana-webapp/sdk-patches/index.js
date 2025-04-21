const fs = require('fs');
const path = require('path');

console.log('Current working directory:', process.cwd());

// Create directories if they don't exist
const dirs = [
  '../contracts/solana/sdk/src/clients',
  '../contracts/solana/sdk/src'
];

dirs.forEach(dir => {
  const dirPath = path.resolve(__dirname, dir);
  console.log('Checking directory:', dirPath);
  
  if (!fs.existsSync(dirPath)) {
    console.log('Directory does not exist, creating:', dirPath);
    fs.mkdirSync(dirPath, { recursive: true });
  } else {
    console.log('Directory exists:', dirPath);
  }
});

// Copy patched files to their destinations
const files = [
  { src: 'offer.ts', dest: '../contracts/solana/sdk/src/clients/offer.ts' },
  { src: 'price.ts', dest: '../contracts/solana/sdk/src/clients/price.ts' },
  { src: 'profile.ts', dest: '../contracts/solana/sdk/src/clients/profile.ts' },
  { src: 'trade.ts', dest: '../contracts/solana/sdk/src/clients/trade.ts' },
  { src: 'walletAdapter.ts', dest: '../contracts/solana/sdk/src/walletAdapter.ts' },
  { src: 'types.ts', dest: '../contracts/solana/sdk/src/types.ts' }
];

files.forEach(file => {
  const srcPath = path.resolve(__dirname, file.src);
  const destPath = path.resolve(__dirname, file.dest);
  
  console.log('Copying file:');
  console.log('  Source:', srcPath);
  console.log('  Destination:', destPath);
  
  try {
    // Read the source file to verify we can access it
    const content = fs.readFileSync(srcPath, 'utf8');
    console.log(`  Read ${content.length} bytes from source file`);
    
    // Check if the source file contains our expected import
    if (content.includes('@coral-xyz/anchor')) {
      console.log('  Source file contains expected import');
    } else {
      console.log('  WARNING: Source file does not contain expected import');
    }
    
    // Write to the destination
    fs.writeFileSync(destPath, content);
    console.log(`  Successfully wrote file to destination`);
    
  } catch (err) {
    console.error(`  ERROR copying ${file.src} to ${file.dest}:`, err.message);
  }
});

console.log('Patch script completed!');