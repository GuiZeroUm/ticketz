module.exports = {
  jest: {
    configure: {
      moduleNameMapper: {
        "^@radix-ui/primitive/is-development$":
          require.resolve("@radix-ui/primitive/is-development")
      }
    }
  },
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
