import math

def round2(val: float) -> float:
    return round(val + 1e-9, 2)

def decompose_and_reconcile(items_data, target_total=None):
    """
    items_data: list of dicts with:
      - 'id': str
      - 'target_subtotal': float (original value or post-rateio target)
      - 'cover_price': float (horus cover price or None/0)
    """
    if target_total is None:
        target_total = round2(sum(it['target_subtotal'] for it in items_data))

    results = []
    
    # Passo 1: Determinar Q e Pu preliminar para cada item respeitando Capa
    for it in items_data:
        target_s = round2(it['target_subtotal'])
        cover = it.get('cover_price') or 0.0

        if cover > 0 and target_s > cover:
            q_min = max(1, math.ceil(target_s / cover))
            
            # Tenta encontrar Q em [q_min, q_min + 3] que divida exatamente sem centavos quebrados
            best_q = q_min
            cents = round(target_s * 100)
            for q_cand in range(q_min, q_min + 4):
                if cents % q_cand == 0:
                    best_q = q_cand
                    break
            
            q = best_q
            pu = round2(target_s / q)
            # Garantia estrita de Pu <= cover
            while pu > cover:
                q += 1
                pu = round2(target_s / q)
        else:
            q = 1
            pu = target_s

        subtotal = round2(q * pu)
        results.append({
            'id': it['id'],
            'cover_price': cover,
            'quantity': q,
            'liquid_value': pu,
            'subtotal': subtotal
        })

    # Passo 2: Calcular a Quebra (diferença residual de centavos vs total desejado)
    current_sum = round2(sum(it['subtotal'] for it in results))
    diff_cents = int(round((target_total - current_sum) * 100))

    # Passo 3: Atribuir a Quebra a itens com quantidade == 1
    if diff_cents != 0:
        # Prioriza itens com Q == 1
        q1_items = [it for it in results if it['quantity'] == 1]
        
        step = 1 if diff_cents > 0 else -1
        idx = 0
        max_loops = abs(diff_cents) * 3
        loops = 0

        while diff_cents != 0 and loops < max_loops:
            loops += 1
            if q1_items:
                target_item = q1_items[idx % len(q1_items)]
                idx += 1
                cover = target_item['cover_price']
                new_pu = round2(target_item['liquid_value'] + (step * 0.01))

                # Valida se não estoura o preço de capa nem fica negativo
                if new_pu > 0 and (cover <= 0 or new_pu <= cover):
                    target_item['liquid_value'] = new_pu
                    target_item['subtotal'] = new_pu # pois Q == 1
                    diff_cents -= step
            else:
                # Se não houver itens com Q == 1, usa o item com menor Q
                sorted_items = sorted(results, key=lambda x: x['quantity'])
                target_item = sorted_items[0]
                new_pu = round2(target_item['liquid_value'] + (step * 0.01))
                if new_pu > 0 and (target_item['cover_price'] <= 0 or new_pu <= target_item['cover_price']):
                    target_item['liquid_value'] = new_pu
                    target_item['subtotal'] = round2(target_item['quantity'] * new_pu)
                    # Recalcula diff_cents
                    current_sum = round2(sum(it['subtotal'] for it in results))
                    diff_cents = int(round((target_total - current_sum) * 100))
                else:
                    break

    final_sum = round2(sum(it['subtotal'] for it in results))
    return results, final_sum

# Teste com o exemplo do usuário:
test_items = [
    {'id': '1', 'target_subtotal': 579.42, 'cover_price': 100.00},
    {'id': '2', 'target_subtotal': 99.45, 'cover_price': 80.00},
    {'id': '3', 'target_subtotal': 88.22, 'cover_price': 75.00},
    {'id': '4', 'target_subtotal': 7.49, 'cover_price': 45.00},
    {'id': '5', 'target_subtotal': 15.52, 'cover_price': 50.00},
]

res, total = decompose_and_reconcile(test_items)
print('Total Desejado:', sum(it['target_subtotal'] for it in test_items))
print('Total Obtido:', total)
for r in res:
    print(f"Item {r['id']}: Qtd={r['quantity']}, Pu={r['liquid_value']} (Capa={r['cover_price']}), Subtotal={r['subtotal']}")
