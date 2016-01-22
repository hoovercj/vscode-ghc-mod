import { IGhcMod, GhcModCmdOpts } from '../../src/ghcModInterfaces';

export class TestGhcMod implements IGhcMod {

    private commandResults: string[];

    public constructor(commandResults: string[]) {
        this.commandResults = commandResults;
    }

    public runGhcModCommand(options: GhcModCmdOpts): Promise<string[]> {
        return Promise.resolve(this.commandResults);
    }

    public killProcess(): void {
        return;
    }
}
