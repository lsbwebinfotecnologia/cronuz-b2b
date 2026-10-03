import requests

def test_api():
    res = requests.get('http://localhost:8000/openapi.json')
    assert res.status_code == 200, f'Status esperado 200, obtido {res.status_code}'
    openapi = res.json()
    paths = openapi.get('paths', {})
    
    # Verifica se as novas rotas estao registradas no OpenAPI
    assert '/companies/{company_id}/pos/branches' in paths, 'Rota /branches nao encontrada no OpenAPI'
    assert '/companies/{company_id}/pos/realtime-search' in paths, 'Rota /realtime-search nao encontrada no OpenAPI'
    
    print('Sucesso: Rotas /branches e /realtime-search registradas com exito!')

if __name__ == '__main__':
    test_api()
