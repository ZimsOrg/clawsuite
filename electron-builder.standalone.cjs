module.exports = {
  appId: 'com.clawsuite.app',
  productName: 'ClawSuite',
  electronVersion: '40.8.2',
  npmRebuild: false,
  asar: false,
  icon: 'assets/icon',
  directories: { output: 'release', buildResources: 'assets' },
  files: ['**/*'],
  mac: {
    icon: 'assets/icon.icns',
    target: [{ target: 'dmg', arch: ['arm64'] }],
    darkModeSupport: true,
  },
  dmg: {
    title: 'ClawSuite',
    contents: [
      { x: 130, y: 220 },
      { x: 410, y: 220, type: 'link', path: '/Applications' },
    ],
  },
};
