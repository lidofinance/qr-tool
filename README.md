# QR gif tool

This tool can be used to encode / decode data in QR-gifs
Just download [html file](index.html) and open it in your browser.

Make sure that sha256 hash of the file is the following:
```
SHA256 (index.html) = 
```
You might type `sha256sum index.html` on your terminal to check it

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
