const path = require("path");
const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");
const InlineChunkHtmlPlugin = require("inline-chunk-html-plugin");
const CssMinimizerPlugin = require("css-minimizer-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const HTMLInlineCSSWebpackPlugin =
  require("html-inline-css-webpack-plugin").default;

module.exports = {
  mode: "development",
  entry: {
    main: "./src/index.ts",
  },
  output: {
    path: path.resolve(__dirname, "./build"),
    publicPath: "",
    filename: "bundle.js",
  },
  resolve: {
    extensions: [".ts", ".js"],
    fallback: {
      buffer: require.resolve("buffer/"),
    },
  },
  plugins: [
    new webpack.ProvidePlugin({
      Buffer: ["buffer", "Buffer"],
    }),
    new HtmlWebpackPlugin({
      inject: "body",
      template: "src/index.html",
    }),
    new webpack.DefinePlugin({
      "process.env": "production",
      "process.version": '"v12.20.1"',
    }),
    new MiniCssExtractPlugin(),
    new InlineChunkHtmlPlugin(HtmlWebpackPlugin, [/./]),
    new HTMLInlineCSSWebpackPlugin(),
  ],
  module: {
    rules: [
      {
        test: /\.css$/i,
        use: [MiniCssExtractPlugin.loader, "css-loader"],
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif|ico)$/i,
        type: "asset/inline",
      },
      {
        test: /\.ts$/,
        loader: "ts-loader",
      },
    ],
  },
  performance: { hints: false },
  optimization: {
    minimize: true,
    removeAvailableModules: true,
    usedExports: true,
    minimizer: [
      new CssMinimizerPlugin(),
      new TerserPlugin({
        terserOptions: {},
      }),
    ],
  },
  mode: "production",
};
