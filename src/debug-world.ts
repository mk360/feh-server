import GameWorld from "feh-battles";
import { Stat } from "feh-battles/dec/interfaces/types";

const debugWorld = new GameWorld();

debugWorld.generateMap();

//s

const teams = [{
    name: "Corrin: Fateful Prince",
    weapon: "Yato",
    boon: "atk" as Stat,
    bane: "res" as Stat,
    skills: {
        A: "Atk/Res Bond 3",
        B: "Pass 3",
        C: "Atk Ploy 3",
        S: "",
        special: "Dragon Fang",
        assist: "Rally Def"
    },
    rarity: 5
}, {
    name: "Shanna: Sprightly Flier",
    weapon: "Silver Lance",
    boon: "hp" as Stat,
    bane: "spd" as Stat,
    skills: {
        A: "",
        B: "",
        C: "Guidance 3",
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
        C: "Odd Atk Wave 3",
        S: "Def +3",
        special: "Astra",
        assist: ""
    },
    rarity: 5
}];

debugWorld.initiate({
    team1: teams,
    team2: teams,
});

export default debugWorld;
