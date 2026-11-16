library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

-- C4_CONTROL_MOTOR_X: control independiente del eje X.
-- Secuencia de medio paso para motor unipolar 28BYJ-48 y driver ULN2003.
-- step_ce es un pulso de UN ciclo del reloj principal, NO un reloj nuevo.
-- Las cuatro salidas van a IN1..IN4 respectivamente.
entity C4_CONTROL_MOTOR_X is
  port(clk : in std_logic; rst : in std_logic; enable_coils : in std_logic;
       step_ce : in std_logic; direction : in std_logic;
       coils : out std_logic_vector(3 downto 0));
end C4_CONTROL_MOTOR_X;
architecture RTL of C4_CONTROL_MOTOR_X is
  signal phase : unsigned(2 downto 0) := (others => '0');
  signal pattern : std_logic_vector(3 downto 0);
begin
  process(clk)
  begin
    if rising_edge(clk) then
      if rst = '1' then phase <= (others => '0');
      elsif step_ce = '1' and enable_coils = '1' then
        if direction = '1' then phase <= phase + 1;
        else phase <= phase - 1; end if;
      end if;
    end if;
  end process;
  with phase select pattern <=
    "0001" when "000", "0011" when "001",
    "0010" when "010", "0110" when "011",
    "0100" when "100", "1100" when "101",
    "1000" when "110", "1001" when others;
  coils <= pattern when enable_coils = '1' else "0000";
end RTL;