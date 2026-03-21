const EfiPayModule = require('payment-token-efi');
console.log("Keys in EfiPayModule:", Object.keys(EfiPayModule));
console.log("Type of EfiPayModule:", typeof EfiPayModule);
console.log("Is EfiPayModule constructor?", typeof EfiPayModule === 'function');
console.log("EfiPayModule.default?", typeof EfiPayModule.default);
