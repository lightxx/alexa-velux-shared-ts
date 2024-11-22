// To parse this data:
//
//   import { Convert, ConfigurationEntry } from "./file";
//
//   const configurationEntry = Convert.toConfigurationEntry(json);
//
// These functions will throw an error if the JSON doesn't
// match the expected interface, even if the JSON is valid.

export interface ConfigurationEntry {
    body:        Body;
    status:      string;
    time_exec:   number;
    time_server: number;
}

export interface Body {
    homes: Home[];
    user:  User;
}

export interface Home {
    id:                         string;
    name:                       string;
    altitude:                   number;
    coordinates:                number[];
    country:                    string;
    timezone:                   string;
    city:                       string;
    currency_code:              string;
    nb_users:                   number;
    data_versions:              DataVersions;
    place_improved:             boolean;
    trust_location:             boolean;
    therm_absence_notification: boolean;
    therm_absence_autoaway:     boolean;
    rooms:                      Room[];
    modules:                    Module[];
}

export interface DataVersions {
    users: number;
}

export interface Module {
    id:               string;
    type:             string;
    name:             string;
    subtype?:         string;
    setup_date:       number;
    reachable?:       boolean;
    modules_bridged?: string[];
    schedule_limits?: ScheduleLimit[];
    capabilities?:    Capability[];
    pincode_enabled?: boolean;
    room_id?:         string;
    bridge?:          string;
    velux_type?:      string;
    group_id?:        string;
}

export interface Capability {
    name:      string;
    available: boolean;
}

export interface ScheduleLimit {
    nb_zones:     number;
    nb_timeslots: number;
    nb_items:     number;
    type:         string;
}

export interface Room {
    id:         string;
    name:       string;
    type:       string;
    module_ids: string[];
    modules:    string[];
}

export interface User {
    email:               string;
    language:            string;
    locale:              string;
    country:             string;
    feel_like_algorithm: number;
    unit_pressure:       number;
    unit_system:         number;
    unit_wind:           number;
    all_linked:          boolean;
    type:                string;
    id:                  string;
    app_telemetry:       boolean;
}

// Converts JSON strings to/from your types
// and asserts the results of JSON.parse at runtime
export class Convert {
    public static toConfigurationEntry(json: string): ConfigurationEntry {
        return cast(JSON.parse(json), r("ConfigurationEntry"));
    }

    public static configurationEntryToJson(value: ConfigurationEntry): string {
        return JSON.stringify(uncast(value, r("ConfigurationEntry")), null, 2);
    }
}

function invalidValue(typ: any, val: any, key: any, parent: any = ''): never {
    const prettyTyp = prettyTypeName(typ);
    const parentText = parent ? ` on ${parent}` : '';
    const keyText = key ? ` for key "${key}"` : '';
    throw Error(`Invalid value${keyText}${parentText}. Expected ${prettyTyp} but got ${JSON.stringify(val)}`);
}

function prettyTypeName(typ: any): string {
    if (Array.isArray(typ)) {
        if (typ.length === 2 && typ[0] === undefined) {
            return `an optional ${prettyTypeName(typ[1])}`;
        } else {
            return `one of [${typ.map(a => { return prettyTypeName(a); }).join(", ")}]`;
        }
    } else if (typeof typ === "object" && typ.literal !== undefined) {
        return typ.literal;
    } else {
        return typeof typ;
    }
}

function jsonToJSProps(typ: any): any {
    if (typ.jsonToJS === undefined) {
        const map: any = {};
        typ.props.forEach((p: any) => map[p.json] = { key: p.js, typ: p.typ });
        typ.jsonToJS = map;
    }
    return typ.jsonToJS;
}

function jsToJSONProps(typ: any): any {
    if (typ.jsToJSON === undefined) {
        const map: any = {};
        typ.props.forEach((p: any) => map[p.js] = { key: p.json, typ: p.typ });
        typ.jsToJSON = map;
    }
    return typ.jsToJSON;
}

function transform(val: any, typ: any, getProps: any, key: any = '', parent: any = ''): any {
    function transformPrimitive(typ: string, val: any): any {
        if (typeof typ === typeof val) return val;
        return invalidValue(typ, val, key, parent);
    }

    function transformUnion(typs: any[], val: any): any {
        // val must validate against one typ in typs
        const l = typs.length;
        for (let i = 0; i < l; i++) {
            const typ = typs[i];
            try {
                return transform(val, typ, getProps);
            } catch (_) {}
        }
        return invalidValue(typs, val, key, parent);
    }

    function transformEnum(cases: string[], val: any): any {
        if (cases.indexOf(val) !== -1) return val;
        return invalidValue(cases.map(a => { return l(a); }), val, key, parent);
    }

    function transformArray(typ: any, val: any): any {
        // val must be an array with no invalid elements
        if (!Array.isArray(val)) return invalidValue(l("array"), val, key, parent);
        return val.map(el => transform(el, typ, getProps));
    }

    function transformDate(val: any): any {
        if (val === null) {
            return null;
        }
        const d = new Date(val);
        if (isNaN(d.valueOf())) {
            return invalidValue(l("Date"), val, key, parent);
        }
        return d;
    }

    function transformObject(props: { [k: string]: any }, additional: any, val: any): any {
        if (val === null || typeof val !== "object" || Array.isArray(val)) {
            return invalidValue(l(ref || "object"), val, key, parent);
        }
        const result: any = {};
        Object.getOwnPropertyNames(props).forEach(key => {
            const prop = props[key];
            const v = Object.prototype.hasOwnProperty.call(val, key) ? val[key] : undefined;
            result[prop.key] = transform(v, prop.typ, getProps, key, ref);
        });
        Object.getOwnPropertyNames(val).forEach(key => {
            if (!Object.prototype.hasOwnProperty.call(props, key)) {
                result[key] = transform(val[key], additional, getProps, key, ref);
            }
        });
        return result;
    }

    if (typ === "any") return val;
    if (typ === null) {
        if (val === null) return val;
        return invalidValue(typ, val, key, parent);
    }
    if (typ === false) return invalidValue(typ, val, key, parent);
    let ref: any = undefined;
    while (typeof typ === "object" && typ.ref !== undefined) {
        ref = typ.ref;
        typ = typeMap[typ.ref];
    }
    if (Array.isArray(typ)) return transformEnum(typ, val);
    if (typeof typ === "object") {
        return typ.hasOwnProperty("unionMembers") ? transformUnion(typ.unionMembers, val)
            : typ.hasOwnProperty("arrayItems")    ? transformArray(typ.arrayItems, val)
            : typ.hasOwnProperty("props")         ? transformObject(getProps(typ), typ.additional, val)
            : invalidValue(typ, val, key, parent);
    }
    // Numbers can be parsed by Date but shouldn't be.
    if (typ === Date && typeof val !== "number") return transformDate(val);
    return transformPrimitive(typ, val);
}

function cast<T>(val: any, typ: any): T {
    return transform(val, typ, jsonToJSProps);
}

function uncast<T>(val: T, typ: any): any {
    return transform(val, typ, jsToJSONProps);
}

function l(typ: any) {
    return { literal: typ };
}

function a(typ: any) {
    return { arrayItems: typ };
}

function u(...typs: any[]) {
    return { unionMembers: typs };
}

function o(props: any[], additional: any) {
    return { props, additional };
}

function m(additional: any) {
    return { props: [], additional };
}

function r(name: string) {
    return { ref: name };
}

const typeMap: any = {
    "ConfigurationEntry": o([
        { json: "body", js: "body", typ: r("Body") },
        { json: "status", js: "status", typ: "" },
        { json: "time_exec", js: "time_exec", typ: 3.14 },
        { json: "time_server", js: "time_server", typ: 0 },
    ], false),
    "Body": o([
        { json: "homes", js: "homes", typ: a(r("Home")) },
        { json: "user", js: "user", typ: r("User") },
    ], false),
    "Home": o([
        { json: "id", js: "id", typ: "" },
        { json: "name", js: "name", typ: "" },
        { json: "altitude", js: "altitude", typ: 0 },
        { json: "coordinates", js: "coordinates", typ: a(3.14) },
        { json: "country", js: "country", typ: "" },
        { json: "timezone", js: "timezone", typ: "" },
        { json: "city", js: "city", typ: "" },
        { json: "currency_code", js: "currency_code", typ: "" },
        { json: "nb_users", js: "nb_users", typ: 0 },
        { json: "data_versions", js: "data_versions", typ: r("DataVersions") },
        { json: "place_improved", js: "place_improved", typ: true },
        { json: "trust_location", js: "trust_location", typ: true },
        { json: "therm_absence_notification", js: "therm_absence_notification", typ: true },
        { json: "therm_absence_autoaway", js: "therm_absence_autoaway", typ: true },
        { json: "rooms", js: "rooms", typ: a(r("Room")) },
        { json: "modules", js: "modules", typ: a(r("Module")) },
    ], false),
    "DataVersions": o([
        { json: "users", js: "users", typ: 0 },
    ], false),
    "Module": o([
        { json: "id", js: "id", typ: "" },
        { json: "type", js: "type", typ: "" },
        { json: "name", js: "name", typ: "" },
        { json: "subtype", js: "subtype", typ: u(undefined, "") },
        { json: "setup_date", js: "setup_date", typ: 0 },
        { json: "reachable", js: "reachable", typ: u(undefined, true) },
        { json: "modules_bridged", js: "modules_bridged", typ: u(undefined, a("")) },
        { json: "schedule_limits", js: "schedule_limits", typ: u(undefined, a(r("ScheduleLimit"))) },
        { json: "capabilities", js: "capabilities", typ: u(undefined, a(r("Capability"))) },
        { json: "pincode_enabled", js: "pincode_enabled", typ: u(undefined, true) },
        { json: "room_id", js: "room_id", typ: u(undefined, "") },
        { json: "bridge", js: "bridge", typ: u(undefined, r("Bridge")) },
        { json: "velux_type", js: "velux_type", typ: u(undefined, r("VeluxType")) },
        { json: "group_id", js: "group_id", typ: u(undefined, "") },
    ], false),
    "Capability": o([
        { json: "name", js: "name", typ: "" },
        { json: "available", js: "available", typ: true },
    ], false),
    "ScheduleLimit": o([
        { json: "nb_zones", js: "nb_zones", typ: 0 },
        { json: "nb_timeslots", js: "nb_timeslots", typ: 0 },
        { json: "nb_items", js: "nb_items", typ: 0 },
        { json: "type", js: "type", typ: "" },
    ], false),
    "Room": o([
        { json: "id", js: "id", typ: "" },
        { json: "name", js: "name", typ: "" },
        { json: "type", js: "type", typ: "" },
        { json: "module_ids", js: "module_ids", typ: a("") },
        { json: "modules", js: "modules", typ: a("") },
    ], false),
    "User": o([
        { json: "email", js: "email", typ: "" },
        { json: "language", js: "language", typ: "" },
        { json: "locale", js: "locale", typ: "" },
        { json: "country", js: "country", typ: "" },
        { json: "feel_like_algorithm", js: "feel_like_algorithm", typ: 0 },
        { json: "unit_pressure", js: "unit_pressure", typ: 0 },
        { json: "unit_system", js: "unit_system", typ: 0 },
        { json: "unit_wind", js: "unit_wind", typ: 0 },
        { json: "all_linked", js: "all_linked", typ: true },
        { json: "type", js: "type", typ: "" },
        { json: "id", js: "id", typ: "" },
        { json: "app_telemetry", js: "app_telemetry", typ: true },
    ], false),
    "Bridge": [
        "70:ee:50:37:50:bb",
    ],
    "VeluxType": [
        "shutter",
    ],
};
