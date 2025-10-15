import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Check, QrCode } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTier: 'free' | 'premium' | 'subscription';
}

export function PaymentModal({ open, onOpenChange, currentTier }: PaymentModalProps) {
  const [selectedTier, setSelectedTier] = useState<'premium' | 'subscription' | null>(null);
  const [qrCode, setQrCode] = useState<string>('');
  const [checkoutUrl, setCheckoutUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const tiers = [
    {
      id: 'premium' as const,
      name: 'Premium Tier',
      price: '$15',
      description: 'One-time payment',
      features: [
        'All free features',
        'Premium support',
        'Advanced analytics',
        'Priority access'
      ],
      disabled: currentTier === 'premium' || currentTier === 'subscription'
    },
    {
      id: 'subscription' as const,
      name: 'Subscription Tier',
      price: '$5',
      period: 'per month',
      description: 'Monthly subscription',
      features: [
        'All premium features',
        'Unlimited access',
        'Monthly updates',
        'Cancel anytime'
      ],
      disabled: currentTier === 'subscription'
    }
  ];

  const handleTierSelect = async (tier: 'premium' | 'subscription') => {
    setSelectedTier(tier);
    setIsLoading(true);

    try {
      const response = await apiRequest('POST', '/api/payments/create-checkout-session', { tier });
      const data = await response.json();

      if (data.qrCode && data.url) {
        setQrCode(data.qrCode);
        setCheckoutUrl(data.url);
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      toast({
        title: "Error",
        description: "Failed to create checkout session. Please try again.",
        variant: "destructive",
      });
      setSelectedTier(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProceedToCheckout = () => {
    if (checkoutUrl) {
      window.location.href = checkoutUrl;
    }
  };

  const handleBack = () => {
    setSelectedTier(null);
    setQrCode('');
    setCheckoutUrl('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]" data-testid="dialog-payment">
        <DialogHeader>
          <DialogTitle data-testid="text-payment-title">
            {selectedTier ? 'Complete Your Purchase' : 'Upgrade Your Plan'}
          </DialogTitle>
          <DialogDescription data-testid="text-payment-description">
            {selectedTier 
              ? 'Scan the QR code with your mobile device or click the button below to proceed'
              : 'Choose the plan that works best for you'
            }
          </DialogDescription>
        </DialogHeader>

        {!selectedTier ? (
          <div className="grid gap-4 py-4">
            {tiers.map((tier) => (
              <Card
                key={tier.id}
                className={`p-6 cursor-pointer transition-all border-2 ${
                  tier.disabled 
                    ? 'opacity-50 cursor-not-allowed' 
                    : 'hover:border-primary'
                }`}
                onClick={() => !tier.disabled && handleTierSelect(tier.id)}
                data-testid={`card-tier-${tier.id}`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-semibold" data-testid={`text-tier-name-${tier.id}`}>
                      {tier.name}
                    </h3>
                    <p className="text-sm text-muted-foreground" data-testid={`text-tier-description-${tier.id}`}>
                      {tier.description}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold" data-testid={`text-tier-price-${tier.id}`}>
                      {tier.price}
                    </div>
                    {tier.period && (
                      <div className="text-sm text-muted-foreground">
                        {tier.period}
                      </div>
                    )}
                  </div>
                </div>
                <ul className="space-y-2">
                  {tier.features.map((feature, index) => (
                    <li key={index} className="flex items-center text-sm" data-testid={`text-feature-${tier.id}-${index}`}>
                      <Check className="h-4 w-4 mr-2 text-primary" />
                      {feature}
                    </li>
                  ))}
                </ul>
                {tier.disabled && (
                  <div className="mt-4 text-sm text-muted-foreground text-center" data-testid={`text-tier-status-${tier.id}`}>
                    {currentTier === tier.id ? 'Current Plan' : 'Already Subscribed'}
                  </div>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin" data-testid="loader-checkout" />
              </div>
            ) : (
              <>
                <div className="bg-muted rounded-lg p-6 space-y-4">
                  <div className="text-center">
                    <h4 className="font-semibold mb-2" data-testid="text-selected-tier">
                      {tiers.find(t => t.id === selectedTier)?.name}
                    </h4>
                    <p className="text-2xl font-bold" data-testid="text-selected-price">
                      {tiers.find(t => t.id === selectedTier)?.price}
                      {selectedTier === 'subscription' && <span className="text-sm font-normal"> /month</span>}
                    </p>
                  </div>

                  {qrCode && (
                    <div className="flex flex-col items-center space-y-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <QrCode className="h-4 w-4" />
                        <span>Scan with mobile device</span>
                      </div>
                      <img 
                        src={qrCode} 
                        alt="Payment QR Code" 
                        className="w-48 h-48 border-2 border-border rounded-lg"
                        data-testid="img-qr-code"
                      />
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleBack}
                    className="flex-1"
                    data-testid="button-back"
                  >
                    Back
                  </Button>
                  <Button
                    onClick={handleProceedToCheckout}
                    className="flex-1"
                    data-testid="button-proceed"
                  >
                    Proceed to Checkout
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
