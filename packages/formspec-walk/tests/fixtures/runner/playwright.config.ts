/** @filedesc Browser-free Playwright cases for the walk execution gate. */
export default { testDir: '.', testMatch: '*.fixture.ts', workers: 1,
    ...(process.env.WALK_DIRECT_REPORTER ? { reporter: [['list'], [process.env.WALK_DIRECT_REPORTER]] } : {}),
};
