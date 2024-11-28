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
