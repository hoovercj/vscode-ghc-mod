import { IGhcMod, GhcModOpts } from '../../src/ghcModInterfaces';

export class TestGhcMod implements IGhcMod {

    private commandResults: string[];

    public constructor(commandResults: string[]) {
        this.commandResults = commandResults;
    }

    public runGhcModCommand(options: GhcModOpts): Promise<string[]> {
        return Promise.resolve(this.commandResults);
    }

    public killProcess(): void {
        return;
    }
}
