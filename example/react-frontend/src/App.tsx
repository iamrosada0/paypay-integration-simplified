import React, { useState, type JSX } from "react";
import axios from "axios";

// Interface for PaymentResponse (unchanged)
interface PaymentResponse {
  success: boolean;
  dynamic_link?: string;
  trade_token?: string;
  out_trade_no: string;
  inner_trade_no: string;
  total_amount: number;
  return_url: string;
  error?: string;
}

const App: React.FC = () => {
  const [amount, setAmount] = useState("50.00");
  const [paymentMethod, setPaymentMethod] = useState<
    "MULTICAIXA_EXPRESS" | "PAYPAY_APP"
  >("MULTICAIXA_EXPRESS");
  const [phoneNum, setPhoneNum] = useState("");
  const [subject, setSubject] = useState("Purchase");
  const [returnUrl, setReturnUrl] = useState("");
  const [modalContent, setModalContent] = useState<JSX.Element | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const BASE_URL = "http://localhost:3000";

  const create = async () => {
    if (!window.confirm("Criar pedido?")) return;
    // if (paymentMethod === "MULTICAIXA_EXPRESS" && !/^\d{9}$/.test(phoneNum)) {
    //   setError("Número de telefone deve ter 9 dígitos.");
    //   return;
    // }
    if (!amount || parseFloat(amount) <= 0) {
      setError("Valor deve ser maior que 0.");
      return;
    }
    setLoading(true);
    setError(null);

    const payload = {
      total_amount: amount,
      paymentMethod,
      ...(paymentMethod === "MULTICAIXA_EXPRESS" && { phone_num: phoneNum }),
      ...(paymentMethod === "PAYPAY_APP" && { subject }),
      ...(paymentMethod === "PAYPAY_APP" &&
        returnUrl && { return_url: returnUrl }),
    };

    try {
      const endpoint =
        paymentMethod === "MULTICAIXA_EXPRESS"
          ? "/api/create"
          : "/api/create-paypay-app";
      const response = await axios.post<PaymentResponse>(
        `${BASE_URL}${endpoint}`,
        payload
      );
      if (response.data.success) {
        console.log(response.data, "TEST LINK");
        if (paymentMethod === "PAYPAY_APP" && response.data.dynamic_link) {
          const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(
            response.data.dynamic_link
          )}`;
          setModalContent(
            <div>
              <p>
                Escaneie o QR code com o PayPay App para completar o pagamento:
              </p>
              <img
                src={qrUrl}
                alt="QR Code"
                className="w-40 h-40 mx-auto mt-2"
              />
            </div>
          );
        } else if (paymentMethod === "MULTICAIXA_EXPRESS") {
          setModalContent(
            <p>
              Pagamento de {response.data.total_amount} AOA iniciado. Autorize
              no app MULTICAIXA Express no número {phoneNum} em até 90 segundos.
            </p>
          );
        }
      } else {
        setModalContent(<p className="text-red-600">{response.data.error}</p>);
      }
    } catch (err) {
      setModalContent(
        <p className="text-red-600">Erro ao criar pedido: {String(err)}</p>
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-center text-blue-700 mb-4">
          Checkout - Agua Rosada Tecnologia
        </h1>
        <div className="flex gap-4 mb-6">
          <button
            onClick={create}
            disabled={loading}
            className={`px-4 py-2 rounded font-semibold text-white ${
              loading ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            Criar Pedido
          </button>
        </div>

        <div className="mb-6">
          <label className="block font-medium text-gray-900 mb-1">
            Método de Pagamento:
          </label>
          <select
            className="w-full border rounded px-3 py-2 mb-2 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={paymentMethod}
            onChange={(e) =>
              setPaymentMethod(
                e.target.value as "MULTICAIXA_EXPRESS" | "PAYPAY_APP"
              )
            }
          >
            <option value="MULTICAIXA_EXPRESS">MULTICAIXA Express</option>
            <option value="PAYPAY_APP">PayPay App</option>
          </select>
          <label className="block font-medium text-gray-900 mb-1">
            Valor (AOA):
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="0.01"
            step="0.01"
            disabled={loading}
            className="w-full border rounded px-3 py-2 mb-2 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {paymentMethod === "MULTICAIXA_EXPRESS" && (
            <>
              <label className="block font-medium text-gray-900 mb-1">
                Número de Telefone:
              </label>
              <input
                type="text"
                value={phoneNum}
                onChange={(e) => setPhoneNum(e.target.value)}
                placeholder="912345678"
                maxLength={15}
                disabled={loading}
                className="w-full border rounded px-3 py-2 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </>
          )}
          {paymentMethod === "PAYPAY_APP" && (
            <>
              <label className="block font-medium text-gray-900 mb-1">
                Assunto:
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Ex: Compra de produtos"
                maxLength={256}
                disabled={loading}
                className="w-full border rounded px-3 py-2 mb-2 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <label className="block font-medium text-gray-900 mb-1">
                URL de Retorno (Opcional):
              </label>
              <input
                type="text"
                value={returnUrl}
                onChange={(e) => setReturnUrl(e.target.value)}
                placeholder="Ex: https://seusite.com/retorno"
                maxLength={1024}
                disabled={loading}
                className="w-full border rounded px-3 py-2 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </>
          )}
        </div>

        {error && <p className="text-red-600 mb-4">{error}</p>}

        {modalContent && (
          <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[500px] h-[600px] bg-white border-2 border-red-500 p-4 rounded shadow-lg">
            <button
              onClick={() => setModalContent(null)}
              className="mb-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Fechar
            </button>
            <div className="overflow-auto text-gray-900">{modalContent}</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
