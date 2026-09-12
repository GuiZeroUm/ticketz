module.exports = {
  webpack: {
    configure: config => {
      config.module.rules.push({
        test: /\.m?js$/,
        resolve: { fullySpecified: false }
      });
      return config;
    }
  }
};
