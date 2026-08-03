// @types/pdf-parse only covers the package root; we import the lib file directly
// to avoid the debug block in pdf-parse's index.js, which breaks under ESM.
declare module 'pdf-parse/lib/pdf-parse.js' {
  import pdfParse from 'pdf-parse'
  export default pdfParse
}
