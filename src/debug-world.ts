import { Stat } from "feh-battles/dec/interfaces/types";

export const team1 = [{
    name: "Chrom: Exalted Prince",
    weapon: "Falchion (Awakening)",
    boon: "def" as Stat,
    bane: "hp" as Stat,
    skills: {
        A: "Brazen Def 3",
        B: "Renewal 1",
        C: "Atk Ploy 3",
        S: "",
        special: "Aether",
        assist: "Reposition"
    },
    rarity: 5
}, {
    name: "Shanna: Sprightly Flier",
    weapon: "Shanna's Lance",
    boon: "hp" as Stat,
    bane: "spd" as Stat,
    skills: {
        A: "Death Blow 3",
        B: "Odd Atk Wave 3",
        C: "Atk Ploy 3",
        S: "",
        special: "Dragon Fang",
        assist: "Pivot"
    },
    rarity: 5
}, {
    name: "Clarisse: Sniper in the Dark",
    weapon: "Sniper's Bow",
    // boon: "res" as Stat,
    // bane: "hp" as Stat,
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

export const team2 = [{
    name: "Corrin: Fateful Princess",
    weapon: "Gloom Breath",
    skills: {
        assist: "",
        special: "Pavise",
        A: "Spd/Def Bond 3",
        B: "Seal Res 3",
        C: "Fortify Dragons",
        S: "Atk/Res Bond 3"
    },
    rarity: 5
}, {
    name: "Fae: Divine Dragon",
    weapon: "Eternal Breath",
    skills: {
        assist: "Shove",
        special: "Aegis",
        A: "Death Blow 3",
        B: "Desperation 3",
        C: "Drive Atk 2",
        S: "",
    },
    rarity: 5,
}, {
    name: "Gray: Wry Comrade",
    weapon: "Zanbato+",
    skills: {
        assist: "",
        special: "Rising Flame",
        A: "Triangle Adept 3",
        B: "Wrath 3",
        C: "Spur Atk 3",
        S: "",
    },
    rarity: 5,
}, {
    name: "Leo: Sorcerous Prince",
    weapon: "Brynhildr",
    skills: {
        assist: "Swap",
        special: "Glacies",
        A: "Fortress Res 3",
        B: "Watersweep 3",
        C: "Infantry Pulse 3",
        S: ""
    },
    rarity: 5
}]
