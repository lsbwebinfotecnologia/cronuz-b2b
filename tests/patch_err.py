import re

path = "backend/app/integrators/inter_client.py"
with open(path, "r") as f:
    content = f.read()

old_err = """        except requests.exceptions.RequestException as e:
            err_details = json.loads(e.response.text) if hasattr(e, 'response') and e.response else str(e)
            logger.error(f"Banco Inter Boleto Error: {err_details}")
            
            # Formate violacoes do Inter
            if isinstance(err_details, dict) and "violacoes" in err_details:
                viols = ", ".join([v.get("razao", "") for v in err_details["violacoes"]])
                raise Exception(f"Erro no Inter: {err_details.get('title', 'Erro')} - {viols}")
                
            raise Exception(f"Erro ao emitir boleto Banco Inter: {err_details}")"""

new_err = """        except requests.exceptions.RequestException as e:
            if hasattr(e, 'response') and e.response is not None:
                try:
                    err_details = e.response.json()
                    viols = ""
                    if "violacoes" in err_details:
                        viols = ", ".join([v.get("razao", "") for v in err_details["violacoes"]])
                    elif "mensagem" in err_details:
                        viols = err_details["mensagem"]
                    elif "title" in err_details:
                        viols = err_details["title"]
                        
                    if viols:
                        raise Exception(f"Erro no Inter: {viols}")
                    raise Exception(f"Erro Banco Inter: {err_details}")
                except Exception as ex:
                    if "Erro no Inter" in str(ex) or "Erro Banco Inter" in str(ex):
                        raise ex
                    raise Exception(f"Erro ao emitir boleto Banco Inter HTTP {e.response.status_code}: {e.response.text}")
            raise Exception(f"Erro crítico de rede com o Banco Inter: {str(e)}")"""

if old_err in content:
    content = content.replace(old_err, new_err)
    with open(path, "w") as f:
        f.write(content)
    print("Patched inter_client.py error handler!")
else:
    print("Could not find block")

