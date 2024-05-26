import GameWorld from "feh-battles";
import { Stat } from "feh-battles/dec/interfaces/types";

const debugWorld = new GameWorld();

debugWorld.generateMap();

const teams = [{
    name: "Black Knight: Sinister General",
    weapon: "Alondite",
    boon: "res" as Stat,
    bane: "hp" as Stat,
    skills: {
        A: "Atk/Res Bond 3",
        B: "Guard 3",
        C: "Atk Ploy 3",
        S: "",
        special: "Black Luna",
        assist: ""
    },
    rarity: 5
}, {
    name: "Shanna: Sprightly Flier",
    weapon: "Killer Lance+",
    boon: "hp" as Stat,
    bane: "spd" as Stat,
    skills: {
        A: "Death Blow 3",
        B: "Guidance 3",
        C: "Atk Ploy 3",
        S: "",
        special: "Dragon Fang",
        assist: "Pivot"
    },
    rarity: 5
}, {
    name: "Clarisse: Sniper in the Dark",
    weapon: "Silver Bow",
    boon: "res" as Stat,
    bane: "hp" as Stat,
    skills: {
        A: "Death Blow 3",
        B: "Guard 3",
        C: "Breath of Life 2",
        S: "Def +3",
        special: "Iceberg",
        assist: ""
    },
    rarity: 5
}, {
    name: "Reinhardt: Thunder's Fist",
    weapon: "Dire Thunder",
    skills: {
        A: "HP +3",
        B: "",
        C: "Ward Cavalry",
        S: "",
        special: "Ignis",
        assist: ""
    },
    rarity: 5
}];

debugWorld.initiate({
    team1: teams,
    team2: teams,
});

export default debugWorld;
