# Simulating the XML pedRegEvento
from lxml import etree
import datetime

chave_limpa = "35041072217026001000108000000000008026047706678375"
id_canc = f"ID202201{chave_limpa}001"

root = etree.Element("pedRegEvento")
root.set("xmlns", "http://www.sped.fazenda.gov.br/nfse")

inf_ped = etree.SubElement(root, "infPedRegEvento", Id=id_canc)

etree.SubElement(inf_ped, "tpAmb").text = "2"
etree.SubElement(inf_ped, "CNPJ").text = "00000000000000" # needs the actual CNPJ of the issuer
etree.SubElement(inf_ped, "chNFSe").text = chave_limpa

# Sefin requires proper datetime
dh_evento = datetime.datetime.now(datetime.timezone.utc).astimezone().isoformat(timespec='seconds')
etree.SubElement(inf_ped, "dhEvento").text = dh_evento

etree.SubElement(inf_ped, "tpEvento").text = "202201"
etree.SubElement(inf_ped, "nSeqEvento").text = "1"
etree.SubElement(inf_ped, "verEvento").text = "1.00"

det_evento = etree.SubElement(inf_ped, "detEvento")
ev_canc = etree.SubElement(det_evento, "evCancNFSe")

etree.SubElement(ev_canc, "descEvento").text = "Cancelamento"
etree.SubElement(ev_canc, "cMotivo").text = "9"
etree.SubElement(ev_canc, "xMotivo").text = "teste teste teste"

raw_xml = etree.tostring(root, encoding='utf8', method='xml').decode('utf-8')
print(raw_xml)
