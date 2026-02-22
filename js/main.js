// js/main.js

// Elementos del DOM
const yamlInput = document.getElementById('yamlInput');
const visualizeBtn = document.getElementById('visualizeBtn');
const exportPngBtn = document.getElementById('exportPngBtn');
const shareBtn = document.getElementById('shareBtn');
const exampleBtn = document.getElementById('exampleBtn');
const detailsContent = document.getElementById('detailsContent');
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');

let cy; // instancia de Cytoscape
let currentGraphElements = []; // para exportar/url

// Inicializar Cytoscape al cargar la página
window.addEventListener('load', () => {
    cy = cytoscape({
        container: document.getElementById('cy'),
        style: [
            {
                selector: 'node',
                style: {
                    'background-color': '#3b82f6',
                    'label': 'data(label)',
                    'color': '#fff',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'font-size': '12px',
                    'width': '80px',
                    'height': '80px',
                    'shape': 'roundrectangle',
                    'border-width': 2,
                    'border-color': '#1e3a8a'
                }
            },
            {
                selector: 'node[type="network"]',
                style: {
                    'background-color': '#10b981',
                    'shape': 'diamond',
                    'border-color': '#065f46'
                }
            },
            {
                selector: 'node[type="volume"]',
                style: {
                    'background-color': '#f59e0b',
                    'shape': 'hexagon',
                    'border-color': '#b45309'
                }
            },
            {
                selector: 'edge',
                style: {
                    'width': 2,
                    'line-color': '#94a3b8',
                    'target-arrow-color': '#475569',
                    'target-arrow-shape': 'triangle',
                    'curve-style': 'bezier',
                    'arrow-scale': 1.2
                }
            },
            {
                selector: 'edge[type="depends"]',
                style: {
                    'line-color': '#ef4444',
                    'target-arrow-color': '#dc2626',
                    'line-style': 'solid'
                }
            },
            {
                selector: 'edge[type="network"]',
                style: {
                    'line-color': '#10b981',
                    'line-style': 'dashed',
                    'target-arrow-shape': 'none'
                }
            },
            {
                selector: 'edge[type="volume"]',
                style: {
                    'line-color': '#f59e0b',
                    'line-style': 'dotted',
                    'target-arrow-shape': 'none'
                }
            }
        ],
        layout: { name: 'cose', animate: false }
    });

    // Evento clic en nodo para mostrar detalles
    cy.on('tap', 'node', (evt) => {
        const node = evt.target;
        const data = node.data();
        let info = `ID: ${data.id}\nTipo: ${data.type || 'servicio'}\n`;
        if (data.image) info += `Imagen: ${data.image}\n`;
        if (data.ports) info += `Puertos: ${data.ports}\n`;
        if (data.environment) info += `Environment: ${data.environment}\n`;
        if (data.volumes) info += `Volúmenes: ${data.volumes}\n`;
        if (data.networks) info += `Redes: ${data.networks}\n`;
        if (data.depends_on) info += `Depende de: ${data.depends_on}\n`;
        detailsContent.textContent = info || 'Sin detalles adicionales';
    });

    // Evento clic en arista (opcional)
    cy.on('tap', 'edge', (evt) => {
        const edge = evt.target;
        detailsContent.textContent = `Arista: ${edge.data('source')} → ${edge.data('target')} (${edge.data('type') || 'dependencia'})`;
    });

    // Cargar desde URL si existe hash
    loadFromHash();
});

// Función para parsear YAML y construir grafo
function buildGraphFromYaml(yamlString) {
    try {
        const doc = jsyaml.load(yamlString);
        if (!doc || typeof doc !== 'object') throw new Error('YAML vacío o inválido');

        const elements = [];
        const services = doc.services || {};
        const networks = doc.networks || {};
        const volumes = doc.volumes || {};

        // Crear nodos para servicios
        Object.keys(services).forEach(serviceName => {
            const svc = services[serviceName];
            const nodeData = {
                id: serviceName,
                label: serviceName,
                type: 'service',
                image: svc.image || '',
                ports: svc.ports ? svc.ports.join(', ') : '',
                environment: svc.environment ? JSON.stringify(svc.environment) : '',
                volumes: svc.volumes ? svc.volumes.join(', ') : '',
                networks: svc.networks ? Object.keys(svc.networks).join(', ') : '',
                depends_on: svc.depends_on ? (Array.isArray(svc.depends_on) ? svc.depends_on.join(', ') : svc.depends_on) : ''
            };
            elements.push({ data: nodeData });
        });

        // Crear nodos para redes
        Object.keys(networks).forEach(netName => {
            elements.push({
                data: {
                    id: `network:${netName}`,
                    label: netName,
                    type: 'network'
                }
            });
        });

        // Crear nodos para volúmenes
        Object.keys(volumes).forEach(volName => {
            elements.push({
                data: {
                    id: `volume:${volName}`,
                    label: volName,
                    type: 'volume'
                }
            });
        });

        // Aristas por depends_on (dependencias entre servicios)
        Object.keys(services).forEach(serviceName => {
            const svc = services[serviceName];
            if (svc.depends_on) {
                const deps = Array.isArray(svc.depends_on) ? svc.depends_on : [svc.depends_on];
                deps.forEach(dep => {
                    if (services[dep]) { // solo si el servicio existe
                        elements.push({
                            data: {
                                id: `dep-${serviceName}-${dep}`,
                                source: serviceName,
                                target: dep,
                                type: 'depends'
                            }
                        });
                    }
                });
            }
        });

        // Aristas servicios → redes
        Object.keys(services).forEach(serviceName => {
            const svc = services[serviceName];
            if (svc.networks) {
                const nets = Object.keys(svc.networks);
                nets.forEach(net => {
                    const netId = `network:${net}`;
                    // Verificar que la red existe en el top-level, si no, crearla implícitamente?
                    if (!elements.find(el => el.data.id === netId)) {
                        // Red implícita (por ejemplo, la red por defecto)
                        elements.push({
                            data: {
                                id: netId,
                                label: net,
                                type: 'network'
                            }
                        });
                    }
                    elements.push({
                        data: {
                            id: `net-${serviceName}-${net}`,
                            source: serviceName,
                            target: netId,
                            type: 'network'
                        }
                    });
                });
            }
        });

        // Aristas servicios → volúmenes
        Object.keys(services).forEach(serviceName => {
            const svc = services[serviceName];
            if (svc.volumes) {
                svc.volumes.forEach(volDef => {
                    // Formato típico: "volumen:/ruta" o "volumen" (named volume)
                    let volName = volDef.split(':')[0];
                    // Si el volumen no está declarado en top-level, puede ser un bind mount (ignorar o tratarlo como volumen anónimo)
                    if (volumes[volName] || true) { // por ahora incluimos todos los volúmenes nombrados
                        const volId = `volume:${volName}`;
                        if (!elements.find(el => el.data.id === volId)) {
                            // Crear nodo volumen si no existe (puede ser anónimo, pero lo mostramos igual)
                            elements.push({
                                data: {
                                    id: volId,
                                    label: volName,
                                    type: 'volume'
                                }
                            });
                        }
                        elements.push({
                            data: {
                                id: `vol-${serviceName}-${volName}`,
                                source: serviceName,
                                target: volId,
                                type: 'volume'
                            }
                        });
                    }
                });
            }
        });

        return elements;
    } catch (e) {
        alert('Error al parsear YAML: ' + e.message);
        return null;
    }
}

// Renderizar el grafo
function renderGraph(elements) {
    if (!cy) return;
    cy.elements().remove(); // limpiar
    cy.add(elements);
    cy.layout({ name: 'cose', animate: true }).run();
    currentGraphElements = elements;
    exportPngBtn.disabled = false;
    shareBtn.disabled = false;
}

// Evento visualizar
visualizeBtn.addEventListener('click', () => {
    const yaml = yamlInput.value;
    if (!yaml.trim()) {
        alert('Pega un docker-compose.yml');
        return;
    }
    const elements = buildGraphFromYaml(yaml);
    if (elements) renderGraph(elements);
});

// Exportar PNG
exportPngBtn.addEventListener('click', () => {
    if (!cy) return;
    const png = cy.png({ full: true, scale: 2 });
    // Convertir base64 a blob
    fetch(png)
        .then(res => res.blob())
        .then(blob => saveAs(blob, 'composeviz-graph.png'));
});

// Compartir URL (codificar YAML en hash)
shareBtn.addEventListener('click', () => {
    const yaml = yamlInput.value;
    if (!yaml.trim()) return;
    const compressed = btoa(encodeURIComponent(yaml)); // codificar seguro
    const url = new URL(window.location.href);
    url.hash = compressed;
    navigator.clipboard.writeText(url.toString())
        .then(() => alert('URL copiada al portapapeles'))
        .catch(() => alert('URL: ' + url.toString()));
});

// Cargar desde hash al inicio
function loadFromHash() {
    if (window.location.hash.length > 1) {
        try {
            const compressed = window.location.hash.slice(1);
            const yaml = decodeURIComponent(atob(compressed));
            yamlInput.value = yaml;
            visualizeBtn.click(); // disparar visualización
        } catch (e) {
            console.warn('Hash inválido, ignorando');
        }
    }
}

// Cargar ejemplo
exampleBtn.addEventListener('click', () => {
    yamlInput.value = `version: '3'

services:
  web:
    image: nginx:alpine
    ports:
      - "80:80"
    depends_on:
      - app
    networks:
      - frontend
      - backend

  app:
    image: node:14
    command: node app.js
    environment:
      - DB_HOST=db
    depends_on:
      - db
    networks:
      - backend
    volumes:
      - app-data:/usr/src/app

  db:
    image: postgres:13
    environment:
      POSTGRES_PASSWORD: example
    volumes:
      - db-data:/var/lib/postgresql/data
    networks:
      - backend

networks:
  frontend:
  backend:

volumes:
  app-data:
  db-data:`;
    visualizeBtn.click();
});

// Subir archivo
uploadBtn.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        yamlInput.value = event.target.result;
        visualizeBtn.click(); // visualizar automáticamente
    };
    reader.readAsText(file);
});