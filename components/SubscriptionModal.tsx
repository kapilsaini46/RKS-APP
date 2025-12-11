
import React, { useState } from 'react';
import { PRICING, UPI_QR_IMAGE } from '../constants';
import { StorageService } from '../services/storageService';
import { User, SubscriptionPlan } from '../types';

interface Props {
  user: User;
  onClose: () => void;
  onSuccess: () => void;
}

const SubscriptionModal: React.FC<Props> = ({ user, onClose, onSuccess }) => {
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan>(SubscriptionPlan.PROFESSIONAL);
  const [proof, setProof] = useState<string>('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => { setProof(reader.result as string); };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    if (!proof) return alert("Please upload payment screenshot");
    try {
        await StorageService.createPaymentRequest(user.email, selectedPlan, proof);
        alert("Payment submitted for approval!");
        onSuccess();
        onClose();
    } catch (e: any) {
        alert("Failed to submit request: " + e.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
        <div className="bg-blue-600 p-4 text-white flex justify-between items-center"><h2 className="text-xl font-bold">Upgrade Plan</h2><button onClick={onClose}><i className="fas fa-times"></i></button></div>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 gap-3">
            {[SubscriptionPlan.STARTER, SubscriptionPlan.PROFESSIONAL, SubscriptionPlan.PREMIUM].map((plan) => (
              <button key={plan} onClick={() => setSelectedPlan(plan)} className={`p-3 border-2 rounded-lg text-left transition-all ${selectedPlan === plan ? 'border-blue-600 bg-blue-50' : 'border-gray-200'}`}>
                <div className="flex justify-between items-center">
                    <div>
                        <div className="font-bold text-gray-800">{PRICING[plan].label}</div>
                        <div className="text-sm text-gray-500">{PRICING[plan].papers} Papers</div>
                    </div>
                    <div className="text-xl font-bold text-blue-600">₹{PRICING[plan].price}</div>
                </div>
              </button>
            ))}
          </div>
          <div className="flex flex-col items-center space-y-2">
            <p className="text-sm text-gray-600">Scan to pay via UPI</p>
            <img src={UPI_QR_IMAGE} alt="UPI QR" className="w-32 h-32 border rounded-lg" />
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-2">Upload Payment Screenshot</label><input type="file" accept="image/*" onChange={handleFileChange} className="block w-full text-sm text-gray-500" /></div>
          <button onClick={handleSubmit} disabled={!proof} className={`w-full py-3 rounded-lg font-bold text-white ${proof ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-400'}`}>Submit for Approval</button>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionModal;
