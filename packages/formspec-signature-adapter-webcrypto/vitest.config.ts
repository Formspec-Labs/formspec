/** @filedesc Vitest configuration for the formspec-signature-adapter-webcrypto package. */
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/**/*.test.ts'],
    },
});
