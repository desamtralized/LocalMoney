import { execSync } from 'child_process';
import * as path from 'path';

function main() {
  const rootDir = path.resolve(__dirname, '../../');
  console.log('Building Solana programs...');

  try {
    // Build all programs
    execSync('cargo build-bpf', {
      cwd: rootDir,
      stdio: 'inherit',
    });

    console.log('Build successful!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

main(); 