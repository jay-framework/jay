export async function setup(ctx: { prompt: { select(o: unknown): Promise<string> } }) {
    const region = await ctx.prompt.select({
        key: 'region',
        message: 'Which region?',
        choices: [{ name: 'EU', value: 'eu' }],
    });
    return { status: 'configured' as const, message: region };
}
