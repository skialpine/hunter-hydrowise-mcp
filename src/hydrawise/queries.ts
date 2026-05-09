export interface User {
  id: number;
  name: string;
  email: string | null;
}

export interface Controller {
  id: number;
  name: string | null;
  online: boolean | null;
  hardware: { serialNumber: string | null } | null;
  lastContactTime: { value: string } | null;
}

export interface Zone {
  id: number;
  name: string;
  number: { value: number };
  status: {
    suspendedUntil: { value: string } | null;
    lastRun: { value: string } | null;
    nextRun: { value: string } | null;
  };
}

export interface StatusCodeAndSummary {
  status: 'OK' | 'WARNING' | 'ERROR';
  summary: string;
}

export const ME_QUERY = /* GraphQL */ `
  query Me {
    me {
      id
      name
      email
    }
  }
`;

export const CONTROLLERS_QUERY = /* GraphQL */ `
  query Controllers {
    me {
      controllers {
        id
        name
        online
        hardware {
          serialNumber
        }
        lastContactTime {
          value
        }
      }
    }
  }
`;

export const CONTROLLER_QUERY = /* GraphQL */ `
  query Controller($controllerId: Int!) {
    controller(controllerId: $controllerId) {
      id
      name
      online
      hardware {
        serialNumber
      }
      lastContactTime {
        value
      }
    }
  }
`;

export const ZONES_QUERY = /* GraphQL */ `
  query Zones($controllerId: Int!) {
    controller(controllerId: $controllerId) {
      zones {
        id
        name
        number {
          value
        }
        status {
          suspendedUntil {
            value
          }
          lastRun {
            value
          }
          nextRun {
            value
          }
        }
      }
    }
  }
`;

export const ZONE_QUERY = /* GraphQL */ `
  query Zone($zoneId: Int!) {
    zone(zoneId: $zoneId) {
      id
      name
      number {
        value
      }
      status {
        suspendedUntil {
          value
        }
        lastRun {
          value
        }
        nextRun {
          value
        }
      }
    }
  }
`;

export const START_ZONE_MUTATION = /* GraphQL */ `
  mutation StartZone(
    $zoneId: Int!
    $markRunAsScheduled: Boolean
    $stackRuns: Boolean
    $customRunDuration: Int
  ) {
    startZone(
      zoneId: $zoneId
      markRunAsScheduled: $markRunAsScheduled
      stackRuns: $stackRuns
      customRunDuration: $customRunDuration
    ) {
      status
      summary
    }
  }
`;

export const STOP_ZONE_MUTATION = /* GraphQL */ `
  mutation StopZone($zoneId: Int!) {
    stopZone(zoneId: $zoneId) {
      status
      summary
    }
  }
`;

export const START_ALL_ZONES_MUTATION = /* GraphQL */ `
  mutation StartAllZones(
    $controllerId: Int!
    $markRunAsScheduled: Boolean
    $customRunDuration: Int
  ) {
    startAllZones(
      controllerId: $controllerId
      markRunAsScheduled: $markRunAsScheduled
      customRunDuration: $customRunDuration
    ) {
      status
      summary
    }
  }
`;

export const STOP_ALL_ZONES_MUTATION = /* GraphQL */ `
  mutation StopAllZones($controllerId: Int!) {
    stopAllZones(controllerId: $controllerId) {
      status
      summary
    }
  }
`;

export const SUSPEND_ZONE_MUTATION = /* GraphQL */ `
  mutation SuspendZone($zoneId: Int!, $until: String!) {
    suspendZone(zoneId: $zoneId, until: $until) {
      status
      summary
    }
  }
`;

export const RESUME_ZONE_MUTATION = /* GraphQL */ `
  mutation ResumeZone($zoneId: Int!) {
    resumeZone(zoneId: $zoneId) {
      status
      summary
    }
  }
`;

export const SUSPEND_ALL_ZONES_MUTATION = /* GraphQL */ `
  mutation SuspendAllZones($controllerId: Int!, $until: String!) {
    suspendAllZones(controllerId: $controllerId, until: $until) {
      status
      summary
    }
  }
`;

export const RESUME_ALL_ZONES_MUTATION = /* GraphQL */ `
  mutation ResumeAllZones($controllerId: Int!) {
    resumeAllZones(controllerId: $controllerId) {
      status
      summary
    }
  }
`;
