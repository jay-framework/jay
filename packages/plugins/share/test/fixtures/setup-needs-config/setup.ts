export async function setup() {
    return { status: 'needs-config' as const, message: 'fill config/x.yaml' };
}
