const fs = require('fs');
let code = fs.readFileSync('frontend/src/app/(dashboard)/settings/bookinfo-sync/page.tsx', 'utf8');

const lastReturnIdx = code.lastIndexOf('return (');
if (lastReturnIdx !== -1) {
  let content = code.substring(lastReturnIdx);
  if (!content.includes('<>')) {
     let newStart = 'return (\n<>\n';
     code = code.substring(0, lastReturnIdx) + newStart + content.substring('return ('.length).replace(/\]\;\s*\}\s*$/g, ';\n}');
     // the outer needs </>
     let finalCode = code.replace(/\n\s*\}\);\n\}\n*$/, '\n</>\n  );\n}\n');
     if (!finalCode.endsWith('}')) finalCode = code.replace(/\);\n\}/, '\n</>\n);\n}');
     fs.writeFileSync('frontend/src/app/(dashboard)/settings/bookinfo-sync/page.tsx', finalCode);
  }
}
