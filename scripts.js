const searchForm = document.querySelector('.search-form');
const productList = document.querySelector('.product-list');
const priceChartCanvas = document.getElementById('price-chart');
const loadingIndicator = document.querySelector('.loading-indicator');
const prevPageBtn = document.querySelector('.prev-page');
const nextPageBtn = document.querySelector('.next-page');
const categorySelect = document.getElementById('category');
let myChart = null;
let currentPage = 1;
let totalPages = 1;
let comparisonProducts = JSON.parse(localStorage.getItem('comparisonProducts')) || [];

function buildApiUrl(searchTerm, filters = {}, page = 1) {
    let apiUrl = `https://api.mercadolibre.com/sites/MLB/search?q=${searchTerm}&offset=${(page - 1) * 10}`;
    for (const key in filters) {
        if (filters[key]) {
            apiUrl += `&${key}=${filters[key]}`;
        }
    }
    return apiUrl;
}

function formatCurrency(number) {
    if (isNaN(number) || number === '') return '';
    return Number(number).toLocaleString('pt-br', { style: 'currency', currency: 'BRL' }).replace(/\D00(?=\D*$)/, '');
}

const minPriceInput = document.getElementById('min-price');
const maxPriceInput = document.getElementById('max-price');

minPriceInput.addEventListener('input', (event) => {
    let value = event.target.value.replace(/\D/g, '');
    if (value) {
        event.target.value = formatCurrency(value);
    } else {
        event.target.value = '';
    }
});

maxPriceInput.addEventListener('input', (event) => {
    let value = event.target.value.replace(/\D/g, '');
    if (value) {
        event.target.value = formatCurrency(value);
    } else {
        event.target.value = '';
    }
});

searchForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const inputValue = event.target[0].value;
    let minPrice = document.getElementById('min-price').value.replace(/\D/g, '');
    let maxPrice = document.getElementById('max-price').value.replace(/\D/g, '');
    const category = categorySelect.value;

    minPrice = minPrice ? Number(minPrice) : '';
    maxPrice = maxPrice ? Number(maxPrice) : '';

    if (minPrice && maxPrice && minPrice > maxPrice) {
        alert('O preço mínimo não pode ser maior que o preço máximo.');
        return;
    }

    loadingIndicator.style.display = 'block';
    productList.innerHTML = '';

    const filters = {};
    if (minPrice) filters.price_from = minPrice;
    if (maxPrice) filters.price_to = maxPrice;
    if (category) filters.category = category;

    const apiUrl = buildApiUrl(inputValue, filters, currentPage);

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`Erro na requisição: ${response.status}`);
        }
        const data = await response.json();

        totalPages = Math.ceil(data.paging.total / 10);
        updatePaginationButtons();

        if (!data.results || data.results.length === 0) {
            productList.innerHTML = '<p class="no-results">Nenhum produto encontrado.</p>';
        } else {
            displayItems(data.results);
            updatePriceChart(data.results);
            displaySearchTime(); // Exibe o horário da pesquisa após a exibição dos resultados
        }
    } catch (error) {
        console.error("Erro ao buscar produtos:", error);
        productList.innerHTML = '<p class="error-message">Erro ao buscar produtos. Tente novamente mais tarde.</p>';
    } finally {
        loadingIndicator.style.display = 'none';
    }
});

// Função para mostrar os itens na tela
function displayItems(products) {
    productList.innerHTML = products.map(product => {
        const sellerNickname = product.seller?.nickname || "Não Informado";
        const condition = product.condition || "Não Informado";
        const soldQuantity = product.sold_quantity || "Não Informado";
        const isCompared = comparisonProducts.some(p => p.id === product.id);
        return `
            <li class="product-card">
                <img src="${product.thumbnail.replace(/\w\.jpg/gi, 'W.jpg')}" alt="${product.title}">
                <div class="product-card-info">
                    <h3>${product.title}</h3>
                    <p class="product-price">${product.price.toLocaleString('pt-br', { style: "currency", currency: "BRL" })}</p>
                    <p class="product-store">Loja: ${sellerNickname}</p>
                    <p class="product-condition">Condição: ${condition}</p>
                    <p class="product-sold-quantity">Vendidos: ${soldQuantity}</p>
                    <a href="${product.permalink}" target="_blank" class="product-link">Ver no Mercado Livre</a>
                    <button class="compare-button" onclick="toggleCompareProduct('${product.id}', '${product.title}', '${product.price}', '${product.thumbnail.replace(/\w\.jpg/gi, 'W.jpg')}')">${isCompared ? 'Remover da Comparação' : 'Comparar'}</button>
                </div>
            </li>
        `;
    }).join('');
}

function toggleCompareProduct(id, title, price, thumbnail) {
    const product = { id, title, price, thumbnail };
    const productIndex = comparisonProducts.findIndex(p => p.id === id);
    
    if (productIndex > -1) {
        comparisonProducts.splice(productIndex, 1);
    } else {
        comparisonProducts.push(product);
    }

    localStorage.setItem('comparisonProducts', JSON.stringify(comparisonProducts));
    displayItems(comparisonProducts); // Atualiza os botões de comparação
    showComparison(); // Atualiza a área de comparação
}

function showComparison() {
    const comparisonContainer = document.querySelector('.compare-container');
    if (comparisonProducts.length === 0) {
        comparisonContainer.innerHTML = '<p>Nenhum produto selecionado para comparação.</p>';
        return;
    }

    comparisonContainer.innerHTML = comparisonProducts.map(product => `
        <div class="compare-card">
            <img src="${product.thumbnail}" alt="${product.title}">
            <h3>${product.title}</h3>
            <p class="product-price">${product.price.toLocaleString('pt-br', { style: "currency", currency: "BRL" })}</p>
        </div>
    `).join('');
}

// Função para atualizar o gráfico de preços
function updatePriceChart(products) {
    if (!priceChartCanvas) {
        console.error("Canvas do gráfico não encontrado!");
        return;
    }

    const ctx = priceChartCanvas.getContext('2d');
    if (!ctx) {
        console.error("Não foi possível obter o contexto 2D do canvas.");
        return;
    }

    if (myChart) {
        myChart.destroy();
    }

    const productTitles = products.map(product => product.title.substring(0, 25) + '...');
    const productPrices = products.map(product => product.price);

    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: productTitles,
            datasets: [{
                label: 'Preço (R$)',
                data: productPrices,
                backgroundColor: 'rgba(46, 204, 113, 0.6)',
                borderColor: 'rgba(46, 204, 113, 1)',
                borderWidth: 1,
                fill: false,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: {
                    display: true,
                    text: 'Comparador de Preços',
                    font: { size: 18 }
                },
                tooltip: {
                    callbacks: {
                        label: function(tooltipItem) {
                            return `R$ ${tooltipItem.raw.toLocaleString('pt-br', { style: 'currency', currency: 'BRL' })}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return 'R$' + value.toLocaleString('pt-br', { style: 'currency', currency: 'BRL' });
                        }
                    }
                },
                x: {
                    ticks: {
                        maxRotation: 45,
                        minRotation: 0
                    }
                }
            }
        }
    });
}

// Função para exibir o horário da pesquisa
function displaySearchTime() {
    const searchTimeElement = document.getElementById('search-time');
    const currentTime = new Date();
    const formattedTime = currentTime.toLocaleString('pt-BR', { 
        weekday: 'short', 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
    });

    searchTimeElement.textContent = `Pesquisa realizada em: ${formattedTime}`;
}

// Função para atualizar os botões de paginação
function updatePaginationButtons() {
    prevPageBtn.disabled = currentPage <= 1;
    nextPageBtn.disabled = currentPage >= 1;
    nextPageBtn.disabled = currentPage >= totalPages;
}

// Eventos de paginação
prevPageBtn.addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        searchForm.dispatchEvent(new Event('submit'));
    }
});

nextPageBtn.addEventListener('click', () => {
    if (currentPage < totalPages) {
        currentPage++;
        searchForm.dispatchEvent(new Event('submit'));
    }
});

// Inicializa a exibição da comparação ao carregar a página
document.addEventListener('DOMContentLoaded', showComparison);
