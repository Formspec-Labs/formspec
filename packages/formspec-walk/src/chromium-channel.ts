/** Select an installed Chromium channel when the host has one. */
export function chromiumChannel(): { channel?: string } {
    const channel = process.env.FORMSPEC_CHROMIUM_CHANNEL;
    return channel ? { channel } : {};
}
