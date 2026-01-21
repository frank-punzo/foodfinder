const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Expo config plugin to add Health Connect package query
 * This allows the app to check if Health Connect is installed
 */
const withHealthConnectPermissions = (config) => {
  return withAndroidManifest(config, async (config) => {
    const manifest = config.modResults.manifest;

    // Add queries element to check if Health Connect is installed
    if (!manifest.queries) {
      manifest.queries = [];
    }

    // Check if the package query already exists
    const hasHealthConnectQuery = manifest.queries.some(query => {
      return query.package?.some(pkg =>
        pkg.$?.['android:name'] === 'com.google.android.apps.healthdata'
      );
    });

    if (!hasHealthConnectQuery) {
      manifest.queries.push({
        package: [
          {
            $: {
              'android:name': 'com.google.android.apps.healthdata',
            },
          },
        ],
      });
    }

    return config;
  });
};

module.exports = withHealthConnectPermissions;
