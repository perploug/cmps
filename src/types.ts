export interface PortMapping {
  hostPort: number;
  containerPort: number;
  protocol: 'tcp' | 'udp';
}

export interface ServiceInfo {
  name: string;
  image: string;
  state: string;
  ports: PortMapping[];
}

export interface AppState {
  composePath: string;
  sandboxName: string;
  services: ServiceInfo[];
  publishedPorts: PortMapping[];
  startedAt: string;
}
