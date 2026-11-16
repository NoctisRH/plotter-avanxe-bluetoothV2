library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

-- C2_INTERPRETE_COMANDOS: recibe y verifica paquetes binarios completos desde C1_RECEPCION_UART.
-- Paquete fijo: A5 CMD XH XL YH YL ZH ZL RATE CHECK
-- CHECK = XOR de los nueve primeros bytes (incluyendo A5).
-- Las distancias son desplazamientos relativos SIGNED de 16 bits en medios pasos.
entity C2_INTERPRETE_COMANDOS is
  port(clk : in std_logic; rst : in std_logic;
       rx_data : in std_logic_vector(7 downto 0); rx_valid : in std_logic;
       cmd_valid : out std_logic; bad_checksum : out std_logic;
       cmd : out std_logic_vector(7 downto 0);
       dx : out signed(15 downto 0); dy : out signed(15 downto 0);
       dz : out signed(15 downto 0); rate : out std_logic_vector(7 downto 0));
end C2_INTERPRETE_COMANDOS;
architecture RTL of C2_INTERPRETE_COMANDOS is
  signal index : integer range 0 to 9 := 0;
  signal xor_reg : std_logic_vector(7 downto 0) := (others => '0');
  signal cmd_r, rate_r : std_logic_vector(7 downto 0) := (others => '0');
  signal xh,xl,yh,yl,zh,zl : std_logic_vector(7 downto 0) := (others => '0');
  signal valid_r, error_r : std_logic := '0';
begin
  cmd_valid <= valid_r;
  bad_checksum <= error_r;
  cmd <= cmd_r;
  rate <= rate_r;
  dx <= signed(xh & xl);
  dy <= signed(yh & yl);
  dz <= signed(zh & zl);
  process(clk)
  begin
    if rising_edge(clk) then
      valid_r <= '0'; error_r <= '0';
      if rst = '1' then
        index <= 0; xor_reg <= (others => '0');
      elsif rx_valid = '1' then
        if index = 0 then
          if rx_data = x"A5" then
            xor_reg <= rx_data; index <= 1;
          end if;
        elsif index = 9 then
          if rx_data = xor_reg then valid_r <= '1';
          else error_r <= '1'; end if;
          index <= 0;
        else
          xor_reg <= xor_reg xor rx_data;
          case index is
            when 1 => cmd_r <= rx_data;
            when 2 => xh <= rx_data;
            when 3 => xl <= rx_data;
            when 4 => yh <= rx_data;
            when 5 => yl <= rx_data;
            when 6 => zh <= rx_data;
            when 7 => zl <= rx_data;
            when 8 => rate_r <= rx_data;
            when others => null;
          end case;
          index <= index + 1;
        end if;
      end if;
    end if;
  end process;
end RTL;