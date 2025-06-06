module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  collectCoverageFrom: [
    'src/utils/csv-utils.ts'
  ],
  moduleDirectories: ['node_modules', '<rootDir>/test/__mocks__'],
  moduleNameMapper: {
    '^obsidian$': '<rootDir>/test/__mocks__/obsidian.js'
  },
  globals: {
    'ts-jest': {
      tsconfig: {
        esModuleInterop: true
      }
    }
  }
};
