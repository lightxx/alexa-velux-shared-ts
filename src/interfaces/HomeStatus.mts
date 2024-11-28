export interface HomeStatus {
    status:      string;
    time_server: number;
    body:        Body;
}

export interface Body {
    home: Home;
}

export interface Home {
    id:      string;
    modules: Module[];
    rooms:   Room[];
}

export interface Module {
    busy?:                         boolean;
    calibrating?:                  boolean;
    firmware_revision_netatmo?:    number;
    firmware_revision_thirdparty?: string;
    hardware_version?:             number;
    id:                            string;
    is_raining?:                   boolean;
    last_seen:                     number;
    locked?:                       boolean;
    locking?:                      boolean;
    name?:                         string;
    pairing?:                      string;
    secure?:                       boolean;
    type:                          string;
    wifi_strength?:                number;
    wifi_state?:                   string;
    battery_state?:                string;
    current_position?:             number;
    firmware_revision?:            number;
    manufacturer?:                 string;
    mode?:                         string;
    reachable?:                    boolean;
    silent?:                       boolean;
    target_position?:              number;
    velux_type?:                   string;
    bridge?:                       string;
    battery_level?:                number;
    battery_percent?:              number;
    rf_strength?:                  number;
    rf_state?:                     string;
}

export interface Room {
    air_quality:             number;
    algo_status:             number;
    auto_close_ts:           number;
    co2:                     number;
    humidity:                number;
    id:                      string;
    lux:                     number;
    max_comfort_co2:         number;
    max_comfort_humidity:    number;
    max_comfort_temperature: number;
    min_comfort_humidity:    number;
    min_comfort_temperature: number;
    temperature:             number;
}
