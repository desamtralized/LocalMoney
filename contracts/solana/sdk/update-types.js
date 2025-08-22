const fs = require('fs');
const path = require('path');

// Read the IDL
const idl = JSON.parse(fs.readFileSync('../target/idl/offer.json', 'utf8'));

// Convert snake_case to camelCase for TypeScript
function toCamelCase(str) {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

// Process the IDL for TypeScript
const processedIdl = JSON.parse(JSON.stringify(idl));

// Update field names in types to camelCase
if (processedIdl.types) {
  processedIdl.types.forEach(type => {
    if (type.type && type.type.fields) {
      type.type.fields.forEach(field => {
        field.name = toCamelCase(field.name);
      });
    }
  });
}

// Update instruction args to camelCase
if (processedIdl.instructions) {
  processedIdl.instructions.forEach(instruction => {
    if (instruction.args) {
      instruction.args.forEach(arg => {
        const originalName = arg.name;
        arg.name = toCamelCase(arg.name);
        
        // Update path references in accounts
        if (instruction.accounts) {
          instruction.accounts.forEach(account => {
            if (account.pda && account.pda.seeds) {
              account.pda.seeds.forEach(seed => {
                if (seed.kind === 'arg' && seed.path === originalName) {
                  seed.path = toCamelCase(originalName);
                }
              });
            }
          });
        }
      });
    }
  });
}

// Create TypeScript type export
const tsContent = `/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at \`target/idl/offer.json\`.
 */
export type Offer = ${JSON.stringify(processedIdl, null, 2)};
`;

// Write the TypeScript file
fs.writeFileSync('./src/types/offer.ts', tsContent);
console.log('✅ Updated offer.ts with proper camelCase types');

// Also save the raw IDL for reference
fs.writeFileSync('./src/types/offer.idl.json', JSON.stringify(idl, null, 2));
console.log('✅ Saved raw IDL to offer.idl.json');