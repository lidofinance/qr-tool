# QR gif tool

## Depretaced ⚠️

The application was used as part of [dc4bc](https://github.com/lidofinance/dc4bc) and is no longer supported after [rotating withdrawal credentials from 0x00 type a to 0x01](https://twitter.com/LidoFinance/status/1646977448410480643)

---

This tool can be used to encode / decode data in QR-gifs
Just download [html file](index.html) and open it in your browser.

Make sure that sha1 hash of the file is the following:
```
SHA1 (index.html) = 9414f1b091b1687e3c6c2e349a045496e040b2f5
```
You might type `sha1sum index.html` on your terminal to check it

## Installation

```
git clone git@github.com:lidofinance/qr-tool.git
cd qr-tool
yarn
```

## Available Scripts

In the project directory, you can run:

### `yarn start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

### `yarn build`

Builds the app for production to the `build` folder.

### `yarn compact`

Compact build of the app. `index.html` of the repository root is a compact build.

### Notes

- may not work on mobile phone
